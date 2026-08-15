from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_user_sessions(user) -> None:
    """Invalidate access tokens by version and blacklist outstanding refresh tokens."""
    user.auth_version += 1
    user.save(update_fields=["password", "auth_version"])
    outstanding = OutstandingToken.objects.filter(user=user).exclude(
        blacklistedtoken__isnull=False
    )
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding],
        ignore_conflicts=True,
    )


def set_password_and_revoke(user, raw_password: str) -> None:
    user.set_password(raw_password)
    revoke_user_sessions(user)
