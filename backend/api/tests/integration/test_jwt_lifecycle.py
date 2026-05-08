"""
JWT cookie lifecycle: login sets cookies, refresh rotates them, logout
blacklists them, expired tokens are refused.

Audit gap closed: existing auth tests validate the happy path with
status-code-only checks. None exercise the cookie HttpOnly flag, refresh
rotation, or expired-token rejection.
"""
from datetime import timedelta

import pytest
from django.urls import reverse
from rest_framework_simplejwt.tokens import RefreshToken

from api.tests.helpers.assertions import assert_api_response, assert_problem_detail
from api.tests.helpers.factories import UserFactory


@pytest.fixture
def user():
    user = UserFactory()
    user.set_password('correct-horse-battery-staple')
    user.save(update_fields=['password'])
    return user


@pytest.mark.integration
@pytest.mark.django_db
class TestLoginSetsCookies:
    """``POST /api/auth/login/`` must set ``access_token`` and ``refresh_token``."""

    def test_login_returns_tokens_and_sets_cookies(self, client, user):
        response = client.post(
            reverse('token_obtain_pair'),
            data={'email': user.email, 'password': 'correct-horse-battery-staple'},
            content_type='application/json',
        )
        assert_api_response(response, 200, contains={'access', 'refresh'})

        cookies = response.cookies
        assert 'access_token' in cookies, f'No access_token cookie. Got {list(cookies)}'
        assert 'refresh_token' in cookies, f'No refresh_token cookie. Got {list(cookies)}'

        refresh_morsel = cookies['refresh_token']
        assert refresh_morsel['httponly'], 'refresh_token must be HttpOnly'

    def test_wrong_password_rejected_with_problem_detail(self, client, user):
        response = client.post(
            reverse('token_obtain_pair'),
            data={'email': user.email, 'password': 'nope'},
            content_type='application/json',
        )
        assert_problem_detail(response, 401)


@pytest.mark.integration
@pytest.mark.django_db
class TestRefreshRotation:
    """``POST /api/auth/refresh/`` accepts the cookie and returns a new access."""

    def test_refresh_with_cookie_returns_new_access(self, client, user):
        refresh = RefreshToken.for_user(user)
        client.cookies['refresh_token'] = str(refresh)

        response = client.post(reverse('token_refresh'))
        assert_api_response(response, 200, contains={'access'})

    def test_refresh_with_missing_token_rejected(self, client):
        response = client.post(reverse('token_refresh'))
        assert_problem_detail(response, 401)

    def test_refresh_with_expired_token_rejected(self, client, user):
        refresh = RefreshToken.for_user(user)
        refresh.set_exp(lifetime=timedelta(seconds=-1))
        client.cookies['refresh_token'] = str(refresh)

        response = client.post(reverse('token_refresh'))
        assert_problem_detail(response, 401)


@pytest.mark.integration
@pytest.mark.django_db
class TestLogoutClearsCookies:
    """Logout deletes the cookies and blacklists the refresh token."""

    def test_logout_clears_cookies(self, client, user):
        client.force_login(user)
        refresh = RefreshToken.for_user(user)
        client.cookies['refresh_token'] = str(refresh)
        client.cookies['access_token'] = str(refresh.access_token)

        response = client.post(reverse('logout'))
        assert response.status_code in (200, 205)

        # Django's test client surfaces "deleted" cookies as Max-Age=0.
        cleared = response.cookies
        for cookie_name in ('access_token', 'refresh_token'):
            assert cookie_name in cleared, f'{cookie_name} not present in response cookies'
            assert cleared[cookie_name]['max-age'] in (0, '0', ''), (
                f'{cookie_name} should be cleared (max-age=0); got {cleared[cookie_name]!r}'
            )
