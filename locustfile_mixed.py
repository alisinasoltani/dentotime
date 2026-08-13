from locust import HttpUser, task, between

class NormalUser(HttpUser):
    wait_time = between(1, 5)
    weight = 5  # 5x more normal users than admins
    token = None

    def on_start(self):
        res = self.client.post("/api/v1/auth/login/", json={
            "phone_number": "+1234567890", "password": "TestPass123!", "user_type": "USER"
        })
        if res.status_code == 200:
            self.token = res.json()["access"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task(3)
    def list_slots(self):
        self.client.get("/api/v1/appointments/slots/")

    @task(2)
    def my_appointments(self):
        self.client.get("/api/v1/appointments/me/")

    @task(1)
    def get_settings(self):
        self.client.get("/api/v1/settings/")

class AdminUser(HttpUser):
    wait_time = between(2, 6)
    weight = 1  # Fewer admins
    token = None

    def on_start(self):
        res = self.client.post("/api/v1/auth/login/", json={
            "phone_number": "+1234567892", "password": "TestPass123!", "user_type": "ADMIN"
        })
        if res.status_code == 200:
            self.token = res.json()["access"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task(2)
    def list_all_appointments(self):
        self.client.get("/api/v1/admin/appointments/")

    @task(1)
    def view_calendar(self):
        self.client.get("/api/v1/admin/appointments/calendar/?month=2024-05")