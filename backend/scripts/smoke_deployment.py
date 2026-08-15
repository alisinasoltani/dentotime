"""Fail a release when a deployed backend misses its minimal production contract."""

import os
import urllib.error
import urllib.request


origin = os.environ["SMOKE_BACKEND_URL"].rstrip("/")


def get(path):
    request = urllib.request.Request(
        f"{origin}{path}",
        headers={"Accept": "application/json", "X-Forwarded-Proto": "https"},
    )
    return urllib.request.urlopen(request, timeout=10)


with get("/api/v1/health/") as response:
    assert response.status == 200 and b'"status":"ok"' in response.read().replace(b" ", b"")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
with get("/api/v1/ready/") as response:
    assert response.status == 200 and b'"status":"ready"' in response.read().replace(b" ", b"")
try:
    get("/silk/")
except urllib.error.HTTPError as error:
    assert error.code == 404
else:
    raise AssertionError("Production profiling route is reachable.")

print("Deployment smoke checks passed.")
