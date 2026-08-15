from locust import HttpUser, task, between

class DentotimeUser(HttpUser):
    wait_time = between(1, 3)
    token = None

    def on_start(self):
        # Login before starting stress test
        # Ensure you have a test user in the DB: +1234567890 / TestPass123!
        res = self.client.post("/api/v1/auth/login/", json={
            "phone_number": "+1234567890",
            "password": "TestPass123!",
            "user_type": "USER"
        })
        if res.status_code == 200:
            self.token = res.json()["access"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task(3)
    def view_slots(self):
        self.client.get("/api/v1/appointments/slots/")

    @task(2)
    def view_my_appointments(self):
        self.client.get("/api/v1/appointments/me/")

    @task(1)
    def view_system_settings(self):
        self.client.get("/api/v1/settings/")