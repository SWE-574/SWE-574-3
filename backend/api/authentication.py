from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CookieJWTAuthentication(JWTAuthentication):
    """
    Reads the JWT access token from the 'access_token' cookie instead of
    the Authorization header. Falls back silently so that the standard
    JWTAuthentication (header-based) can still act as a secondary class.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get('access_token')
        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
        except InvalidToken:
            return None

        try:
            user = self.get_user(validated_token)
        except Exception:
            return None

        return user, validated_token


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    """
    Tells drf_spectacular how to document CookieJWTAuthentication in the
    OpenAPI schema — suppresses the W001 warning and adds a proper
    'cookieAuth' security scheme to /api/docs/.
    """
    target_class = 'api.authentication.CookieJWTAuthentication'
    name = 'cookieAuth'

    def get_security_definition(self, auto_schema):
        return {
            'type': 'apiKey',
            'in': 'cookie',
            'name': 'access_token',
            'description': (
                'JWT access token stored in the `access_token` HTTP cookie. '
                'Set automatically by the login/register endpoints. '
                'The companion `refresh_token` (HttpOnly) is used to obtain a new access token.'
            ),
        }
