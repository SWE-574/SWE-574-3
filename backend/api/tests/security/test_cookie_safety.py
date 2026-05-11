"""Security regression tests for the auth cookie writer.

These tests cover three failure modes the CodeQL ``py/cookie-injection``
alert (#475) flagged on ``CustomTokenRefreshView``:

* The refresh-token cookie value must never echo user-controlled bytes.
* The auth cookies must always carry ``HttpOnly``, ``SameSite``, and
  ``Path``; ``Secure`` is asserted under production settings only.
* The structural ``_is_jwt_shape`` guard refuses any non-JWT input so a
  future caller forgetting to re-serialise cannot reintroduce the flaw.
"""

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from api.tests.helpers.factories import UserFactory
from api.views import _is_jwt_shape, _set_auth_cookies


def _login(client: APIClient, email: str = "cookiesafe@test.com") -> str:
    user = UserFactory(email=email)
    user.set_password("testpass123")
    user.save()
    resp = client.post(
        "/api/auth/login/", {"email": email, "password": "testpass123"}
    )
    assert resp.status_code == 200, resp.content
    return resp.data["refresh"]


def _assert_cookie_flags(morsel, *, secure_required: bool) -> None:
    """All auth cookies must be HttpOnly, scoped to ``/``, with SameSite set."""
    assert morsel["httponly"], "auth cookie missing HttpOnly"
    assert morsel["path"] == "/", f"unexpected cookie path: {morsel['path']!r}"
    samesite = (morsel["samesite"] or "").lower()
    assert samesite in {"lax", "strict"}, f"unexpected SameSite: {samesite!r}"
    if secure_required:
        assert morsel["secure"], "auth cookie missing Secure under production settings"


@pytest.mark.unit
class TestIsJwtShape:
    """``_is_jwt_shape`` is the structural last-line guard for the cookie writer."""

    def test_accepts_canonical_jwt_shape(self):
        token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature-bytes_here"
        assert _is_jwt_shape(token) is True

    @pytest.mark.parametrize(
        "value",
        [
            "",
            "not-a-jwt",
            "only.two",
            "four.parts.are.too-many",
            "header.payload.sig with space",
            "header.payload.sig\nwith-newline",
            "header.payload.sig;Path=/admin",
            "header.payload.; Secure",
            "header..signature",
            ".payload.signature",
            "header.payload.",
            None,
            12345,
        ],
    )
    def test_rejects_non_jwt_values(self, value):
        assert _is_jwt_shape(value) is False  # type: ignore[arg-type]


@pytest.mark.unit
class TestSetAuthCookies:
    """The cookie writer refuses to emit Set-Cookie from non-JWT input."""

    def test_raises_when_access_token_is_not_jwt(self):
        from rest_framework.response import Response

        valid_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
        response = Response({})
        with pytest.raises(ValueError, match="Refusing to set auth cookie"):
            _set_auth_cookies(response, "attacker; Path=/", valid_jwt)

    def test_raises_when_refresh_token_is_not_jwt(self):
        from rest_framework.response import Response

        valid_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
        response = Response({})
        with pytest.raises(ValueError, match="Refusing to set auth cookie"):
            _set_auth_cookies(response, valid_jwt, "evil\nvalue")

    def test_writes_both_cookies_when_inputs_are_well_formed(self):
        from rest_framework.response import Response

        valid_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
        response = Response({})
        _set_auth_cookies(response, valid_jwt, valid_jwt)
        assert response.cookies["access_token"].value == valid_jwt
        assert response.cookies["refresh_token"].value == valid_jwt
        _assert_cookie_flags(response.cookies["access_token"], secure_required=False)
        _assert_cookie_flags(response.cookies["refresh_token"], secure_required=False)


@pytest.mark.django_db
@pytest.mark.integration
class TestCookieSafetyOnRefresh:
    """End-to-end coverage for the refresh endpoint (CodeQL #475)."""

    def test_refresh_cookie_does_not_echo_attacker_bytes(self):
        """A malformed ``refresh`` body field never lands in the response cookie.

        ``CustomTokenRefreshView.post`` reads the refresh token from
        ``request.COOKIES['refresh_token']`` first and only falls back to
        ``request.data['refresh']`` when the cookie is absent
        (``cookie or body``). That means the body is the *only* taint
        source CodeQL flagged in the cookie-less path — pinning the
        regression requires posting *without* a ``refresh_token`` cookie
        so the body field is what actually flows into the response.
        """
        client = APIClient()
        # Issue a valid token, then surround it with attacker-controlled
        # cookie-attribute bytes ("\n", "; Path=…"). Suffixing keeps the
        # JWT lookup path alive so the view reaches ``_set_auth_cookies``;
        # the trailing bytes are what the alert worried would be reflected
        # into ``Set-Cookie`` if the writer ever piped raw input through.
        legitimate_refresh = _login(client, email="echo-guard@test.com")
        attacker_payload = (
            f"{legitimate_refresh}\nSet-Cookie: stolen=1; Path=/admin"
        )

        # Explicitly clear the cookie jar so the body is the *only* taint
        # source the view sees — otherwise the cookie precedence in
        # CustomTokenRefreshView shadows the body and the test would
        # vacuously pass.
        client.cookies.clear()
        response = client.post(
            "/api/auth/refresh/", {"refresh": attacker_payload}, format="json"
        )
        # The body fails JWT validation on the suffix bytes; the view
        # rejects with 401 and the cookie writer is never reached. The
        # important contract is that the attacker's bytes are *not*
        # echoed into any auth cookie regardless of status.
        assert response.status_code in (200, 401), response.content

        for cookie_name in ("access_token", "refresh_token"):
            morsel = response.cookies.get(cookie_name)
            if morsel is None:
                continue
            # If a cookie was set, it must be a clean JWT — never the
            # attacker's payload or any of its injection bytes.
            assert _is_jwt_shape(morsel.value), morsel.value
            assert ";" not in morsel.value
            assert "\n" not in morsel.value
            assert "Path=/admin" not in morsel.value
            assert "Set-Cookie" not in morsel.value

    def test_refresh_with_invalid_token_returns_401_and_writes_no_cookie(self):
        """An invalid refresh body must not set any auth cookie."""
        client = APIClient()
        response = client.post(
            "/api/auth/refresh/",
            {"refresh": "totally-bogus-not-a-jwt"},
            format="json",
        )
        assert response.status_code == 401, response.content
        # Cookies dict may be empty; if a key exists, its value must not be the input.
        for cookie_name in ("access_token", "refresh_token"):
            morsel = response.cookies.get(cookie_name)
            if morsel is not None:
                assert "totally-bogus-not-a-jwt" not in morsel.value

    def test_refresh_cookie_flags_are_set_in_dev(self):
        """In dev (DEBUG=True), HttpOnly and SameSite must still be set."""
        client = APIClient()
        legitimate_refresh = _login(client, email="dev-flags@test.com")
        client.cookies["refresh_token"] = legitimate_refresh
        response = client.post("/api/auth/refresh/", {}, format="json")
        assert response.status_code == 200, response.content

        for cookie_name in ("access_token", "refresh_token"):
            _assert_cookie_flags(
                response.cookies[cookie_name], secure_required=False
            )

    @override_settings(IS_PRODUCTION=True)
    def test_refresh_cookie_flags_include_secure_in_production(self):
        """When ``IS_PRODUCTION=True``, ``Secure`` must be set on auth cookies."""
        client = APIClient()
        legitimate_refresh = _login(client, email="prod-flags@test.com")
        client.cookies["refresh_token"] = legitimate_refresh
        response = client.post("/api/auth/refresh/", {}, format="json")
        assert response.status_code == 200, response.content

        for cookie_name in ("access_token", "refresh_token"):
            _assert_cookie_flags(
                response.cookies[cookie_name], secure_required=True
            )


@pytest.mark.django_db
@pytest.mark.integration
class TestCookieSafetyOnLogin:
    """Login is server-side-only; this is a regression net for the same bug class."""

    def test_login_cookies_have_security_flags(self):
        client = APIClient()
        user = UserFactory(email="login-flags@test.com")
        user.set_password("testpass123")
        user.save()

        response = client.post(
            "/api/auth/login/",
            {"email": "login-flags@test.com", "password": "testpass123"},
        )
        assert response.status_code == 200, response.content
        for cookie_name in ("access_token", "refresh_token"):
            morsel = response.cookies[cookie_name]
            _assert_cookie_flags(morsel, secure_required=False)
            assert _is_jwt_shape(morsel.value)
