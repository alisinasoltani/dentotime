from rest_framework.throttling import ScopedRateThrottle

class LoginThrottle(ScopedRateThrottle):
    scope = "login"

class SignupThrottle(ScopedRateThrottle):
    scope = "signup"


class RefreshThrottle(ScopedRateThrottle):
    scope = "refresh"
