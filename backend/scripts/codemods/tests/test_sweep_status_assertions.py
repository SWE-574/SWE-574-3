import textwrap

from scripts.codemods.sweep_status_assertions import rewrite_source, rewrite_file


def _norm(s: str) -> str:
    return textwrap.dedent(s).strip()


def test_rewrites_2xx_status_assert_to_assert_api_response():
    src = _norm("""
        def test_foo(client):
            response = client.get('/api/x/')
            assert response.status_code == 200
    """)
    out, count = rewrite_source(src)
    assert count == 1
    assert 'assert_api_response(response, 200)' in out
    assert 'from api.tests.helpers.assertions import' in out


def test_rewrites_4xx_status_assert_to_assert_problem_detail():
    src = _norm("""
        def test_bad(client):
            resp = client.post('/api/x/', {})
            assert resp.status_code == 400
    """)
    out, count = rewrite_source(src)
    assert count == 1
    assert 'assert_problem_detail(resp, 400)' in out


def test_resolves_drf_status_constants():
    src = _norm("""
        from rest_framework import status

        def test_create(client):
            r = client.post('/api/x/', {})
            assert r.status_code == status.HTTP_201_CREATED
    """)
    out, count = rewrite_source(src)
    assert count == 1
    assert 'assert_api_response(r, 201)' in out


def test_folds_contains_followups():
    src = _norm("""
        def test_get(client):
            response = client.get('/api/x/')
            assert response.status_code == 200
            assert 'id' in response.data
            assert 'name' in response.data
    """)
    out, count = rewrite_source(src)
    assert count == 1
    # Order of set elements is not guaranteed; accept either.
    assert ("contains={'id', 'name'}" in out) or ("contains={'name', 'id'}" in out)


def test_skips_status_in_tuple():
    src = _norm("""
        def test_either(client):
            r = client.get('/api/x/')
            assert r.status_code in (401, 403)
    """)
    out, count = rewrite_source(src)
    assert count == 0
    assert 'r.status_code in (401, 403)' in out


def test_idempotent_when_helper_already_used():
    src = _norm("""
        from api.tests.helpers.assertions import assert_api_response

        def test_foo(client):
            response = client.get('/api/x/')
            assert_api_response(response, 200)
    """)
    out, count = rewrite_source(src)
    assert count == 0


def test_check_mode_does_not_rewrite_returns_truthy(tmp_path):
    f = tmp_path / 'test_sample.py'
    original = _norm("""
        def test_foo(client):
            response = client.get('/api/x/')
            assert response.status_code == 200
    """)
    f.write_text(original)
    changed = rewrite_file(f, check=True)
    assert changed is True
    assert 'assert_api_response' not in f.read_text()


def test_inplace_mode_writes_changes(tmp_path):
    f = tmp_path / 'test_sample.py'
    f.write_text(_norm("""
        def test_foo(client):
            response = client.get('/api/x/')
            assert response.status_code == 204
    """))
    changed = rewrite_file(f, check=False)
    assert changed is True
    new_content = f.read_text()
    assert 'assert_api_response(response, 204)' in new_content
    assert 'from api.tests.helpers.assertions import' in new_content


def test_folds_schema_followups():
    src = _norm("""
        def test_get(client):
            response = client.get('/api/x/')
            assert response.status_code == 200
            assert response.data['id'] == 1
    """)
    out, count = rewrite_source(src)
    assert count == 1
    assert "schema={'id': 1}" in out


def test_does_not_fold_followups_into_4xx_assert_problem_detail():
    # assert_problem_detail's signature only accepts contains_text — folding
    # contains= or schema= into it produces a TypeError at runtime.
    src = _norm("""
        def test_bad(client):
            resp = client.post('/api/x/', {})
            assert resp.status_code == 400
            assert 'detail' in resp.data
            assert resp.data['detail'] == 'must be int'
    """)
    out, count = rewrite_source(src)
    assert count == 1
    assert 'assert_problem_detail(resp, 400)' in out
    # Followups must remain as separate asserts.
    assert "assert 'detail' in resp.data" in out
    assert "assert resp.data['detail'] == 'must be int'" in out


def test_does_not_fold_past_unrelated_statement():
    src = _norm("""
        def test_get(client):
            response = client.get('/api/x/')
            assert response.status_code == 200
            other = response.data['x']
            assert 'y' in response.data
    """)
    out, count = rewrite_source(src)
    assert count == 1
    # The 'y' in response.data assert is past `other = ...` so it must stay.
    assert "assert 'y' in response.data" in out
