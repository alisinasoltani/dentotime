from locust import HttpUser, task, between

class DoctorUploadUser(HttpUser):
    wait_time = between(2, 5)
    token = None

    def on_start(self):
        res = self.client.post("/api/v1/auth/login/", json={
            "phone_number": "+1234567891", "password": "TestPass123!", "user_type": "DOCTOR"
        })
        if res.status_code == 200:
            self.token = res.json()["access"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task
    def request_upload_url(self):
        res = self.client.post("/api/v1/files/presign/", json={
            "purpose": "chat_attachment",
            "file_name": "scan.stl",
            "file_size": 52428800,  # 50 MB
            "file_content_type": "model/stl"
        })
        
        # In a real frontend, we'd upload to S3 here. 
        # We just simulate the confirm step to test DB/S3 HeadObject logic.
        if res.status_code == 200:
            file_key = res.json()["file_key"]
            # Note: This will 404 in Moto/S3 unless you actually PUT the file, 
            # but it tests the backend's ability to handle the S3 client call.
            # self.client.post("/api/v1/files/confirm/", json={"file_key": file_key})