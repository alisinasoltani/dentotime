"""Bounded public read load gate for a deployed release candidate."""

import os

from locust import HttpUser, between, events, task


class PublicVisitor(HttpUser):
    wait_time = between(1, 3)

    @task(1)
    def doctors(self):
        self.client.get("/api/v1/doctors/list/?page=1", name="GET doctors page")

    @task(3)
    def health(self):
        self.client.get("/api/v1/health/", name="GET health")


@events.quitting.add_listener
def enforce_release_budget(environment, **_kwargs):
    p95_budget = int(os.getenv("LOAD_P95_BUDGET_MS", "750"))
    failure_budget = float(os.getenv("LOAD_FAILURE_RATIO", "0.01"))
    total = environment.stats.total
    if (
        total.num_requests == 0
        or total.get_response_time_percentile(0.95) > p95_budget
        or total.fail_ratio > failure_budget
    ):
        environment.process_exit_code = 1
