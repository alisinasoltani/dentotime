from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class SessionVersionJWTAuthentication(JWTAuthentication):
    """Reject JWTs issued before the user's latest credential change."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_version = validated_token.get("auth_version")
        if token_version is None or int(token_version) != user.auth_version:
            raise AuthenticationFailed("Session has been revoked.", code="session_revoked")
        return user
