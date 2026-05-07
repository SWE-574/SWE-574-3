"""
Response-shape assertions for API tests.

Status-only checks like ``assert response.status_code == 200`` are misleading
because the API can return the wrong shape with the right status. These helpers
make body validation the default.

Usage:

    from api.tests.helpers.assertions import assert_api_response

    def test_create_offer(api_client):
        response = api_client.post('/api/services/', {...})
        assert_api_response(
            response,
            201,
            contains={'id', 'title', 'kind', 'created_at'},
        )

For tighter checks, pass ``schema`` (a dict of ``key -> type | callable``):

    assert_api_response(
        response,
        200,
        schema={'id': str, 'balance': lambda v: float(v) >= 0},
    )
"""
from collections.abc import Iterable, Mapping
from typing import Any, Callable


def _format_body(response) -> str:
    try:
        return repr(response.json())[:500]
    except Exception:
        return repr(getattr(response, 'content', b''))[:500]


def assert_api_response(
    response,
    status: int,
    *,
    contains: Iterable[str] | None = None,
    schema: Mapping[str, Any] | None = None,
    item_schema: Mapping[str, Any] | None = None,
    min_length: int | None = None,
):
    """
    Assert ``response.status_code == status`` and validate the body shape.

    Arguments
    ---------
    contains:
        Iterable of keys that MUST exist in the response body (top-level dict).
    schema:
        Mapping of ``key -> expected_type | callable``. ``callable(value)``
        must return truthy. Use this when you care about types as well as
        keys.
    item_schema:
        Same as ``schema`` but applied to every element when the body is a
        list (or ``{"results": [...]}`` paginated payload).
    min_length:
        Minimum length when the body is a list / paginated.
    """
    actual_status = response.status_code
    assert actual_status == status, (
        f'Expected HTTP {status}, got {actual_status}. Body: {_format_body(response)}'
    )

    if status == 204 or status in (301, 302, 303, 307, 308):
        return

    body = response.json()

    if contains:
        target = body if isinstance(body, dict) else {}
        missing = [k for k in contains if k not in target]
        assert not missing, f'Missing keys {missing} in body: {body!r}'

    if schema:
        assert isinstance(body, dict), f'Expected dict body for schema check, got {type(body).__name__}'
        _check_schema(body, schema, path='$')

    if item_schema is not None or min_length is not None:
        items = body['results'] if isinstance(body, dict) and 'results' in body else body
        assert isinstance(items, list), f'Expected list body, got {type(items).__name__}'
        if min_length is not None:
            assert len(items) >= min_length, f'Expected len >= {min_length}, got {len(items)}'
        if item_schema is not None:
            for idx, item in enumerate(items):
                assert isinstance(item, dict), f'Item[{idx}] is not a dict: {item!r}'
                _check_schema(item, item_schema, path=f'$[{idx}]')


def _check_schema(body: dict, schema: Mapping[str, Any], *, path: str):
    for key, expected in schema.items():
        assert key in body, f'{path}.{key} missing from body'
        value = body[key]
        if isinstance(expected, type):
            assert isinstance(value, expected), (
                f'{path}.{key} expected {expected.__name__}, got {type(value).__name__} ({value!r})'
            )
        elif callable(expected):
            assert expected(value), f'{path}.{key} failed predicate (value={value!r})'
        else:
            assert value == expected, f'{path}.{key} expected {expected!r}, got {value!r}'


def assert_problem_detail(response, status: int, *, contains_text: str | None = None):
    """Assert an error response is a real problem-detail body, not a bare status."""
    assert_api_response(response, status)
    body = response.json()
    has_signal = any(
        isinstance(body.get(k), str) for k in ('detail', 'message', 'error', 'errors')
    )
    assert has_signal, f'Error body has no detail/message/error: {body!r}'
    if contains_text:
        flat = repr(body).lower()
        assert contains_text.lower() in flat, f'Expected {contains_text!r} in error body, got {body!r}'
