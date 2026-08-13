import pytest

@pytest.mark.django_db
def test_presign_rejects_invalid_file_type(doctor_client, mock_s3, settings):
    """
    TEST: S3 Presign Rejected Invalid File Type
    DESCRIPTION: Verifies the security allowlist that prevents doctors from
                 uploading non-medical/executable files (like .exe).
    EXAMPLE:
        Request: Upload "malware.exe" (application/vnd.microsoft.portable-executable)
        Expected Result: 400 Bad Request ("Unsupported file type")
    """
    print("\n" + "="*50)
    print("Running: Reject Invalid File Type Test")
    print("="*50)
    
    settings.AWS_STORAGE_BUCKET_NAME = "test-bucket"
    payload = {
        "purpose": "chat_attachment",
        "file_name": "malware.exe",
        "file_size": 1024,
        "file_content_type": "application/vnd.microsoft.portable-executable"
    }
    res = doctor_client.post("/api/v1/files/presign/", payload, format="json")
    
    print(f"Response Status: {res.status_code} (Expected: 400)")
    assert res.status_code == 400
    assert "Unsupported file type" in res.data["detail"]
    print("Result: PASSED\n")


@pytest.mark.django_db
def test_confirm_upload_ownership_check(doctor_client, doctor_user, mock_s3, settings):
    """
    TEST: S3 Confirm Upload Ownership Check
    DESCRIPTION: Verifies that a doctor cannot confirm (and thus attach to a message)
                 a file that belongs to another doctor's S3 folder.
    EXAMPLE:
        Doctor ID: 1
        Request: Confirm file_key "uploads/doctors/999/chat/file.pdf"
        Expected Result: 403 Forbidden ("does not belong to you")
    """
    print("\n" + "="*50)
    print("Running: Upload Ownership Check Test")
    print("="*50)
    
    settings.AWS_STORAGE_BUCKET_NAME = "test-bucket"
    payload = {"file_key": "uploads/doctors/999/chat/file.pdf"}
    res = doctor_client.post("/api/v1/files/confirm/", payload, format="json")
    
    print(f"Response Status: {res.status_code} (Expected: 403)")
    assert res.status_code == 403
    assert "does not belong to you" in res.data["detail"]
    print("Result: PASSED\n")