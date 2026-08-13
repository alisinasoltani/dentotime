from locust import HttpUser, task, between

class ChatUser(HttpUser):
    wait_time = between(1, 3) # Polls every 1-3 seconds
    token = None
    thread_id = None

    def on_start(self):
        res = self.client.post("/api/v1/auth/login/", json={
            "phone_number": "+1234567891", "password": "TestPass123!", "user_type": "DOCTOR"
        })
        if res.status_code == 200:
            self.token = res.json()["access"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})
            
            # Get or create the thread
            thread_res = self.client.post("/api/v1/chat/threads/get_or_create/")
            if thread_res.status_code in [200, 201]:
                self.thread_id = thread_res.json()["id"]

    @task(3)
    def fetch_messages(self):
        if self.thread_id:
            self.client.get(f"/api/v1/chat/threads/{self.thread_id}/messages/")

    @task(1)
    def send_message(self):
        if self.thread_id:
            self.client.post(f"/api/v1/chat/threads/{self.thread_id}/messages/", json={
                "body": "Hello from Locust!"
            })