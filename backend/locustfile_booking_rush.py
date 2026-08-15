from locust import HttpUser, task, constant

class BookingRushUser(HttpUser):
    wait_time = constant(0) # Hit it immediately
    token = None

    def on_start(self):
        res = self.client.post("/api/v1/auth/login/", json={
            "phone_number": "+1234567890", "password": "TestPass123!", "user_type": "USER"
        })
        if res.status_code == 200:
            self.token = res.json()["access"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task
    def book_slot(self):
        # Replace this UUID with a real AVAILABLE slot ID from your database
        slot_uuid = "YOUR-AVAILABLE-SLOT-UUID-HERE"
        self.client.post("/api/v1/appointments/", json={
            "slot_id": slot_uuid,
            "reason": "Stress test booking"
        })