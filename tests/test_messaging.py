import pytest
from messaging.models import MessageThread

@pytest.mark.django_db
def test_unverified_doctor_cannot_chat(doctor_client, doctor_user):
    """
    TEST: Unverified Doctor Cannot Chat
    DESCRIPTION: Verifies that a newly registered doctor (whose verification_status
                 is NOT_SUBMITTED or PENDING) is blocked from creating chat threads.
    EXAMPLE:
        Doctor Status: NOT_SUBMITTED
        Action: POST /api/v1/chat/threads/get_or_create/
        Expected Result: 403 Forbidden ("chat privileges are disabled")
    """
    print("\n" + "="*50)
    print("Running: Unverified Doctor Chat Block Test")
    print("="*50)
    
    res = doctor_client.post("/api/v1/chat/threads/get_or_create/")
    
    print(f"Response Status: {res.status_code} (Expected: 403)")
    assert res.status_code == 403
    assert "chat privileges are disabled" in res.data["detail"]
    print("Result: PASSED\n")


@pytest.mark.django_db
def test_attachment_rejected_in_user_thread(authed_client, normal_user, admin_user):
    """
    TEST: Attachment Rejected in User Thread
    DESCRIPTION: Verifies that normal users cannot send file attachments in their
                 admin chat threads (attachments are strictly for Doctor-Admin threads).
    EXAMPLE:
        Thread Type: USER_ADMIN
        Action: Send message with attachment payload
        Expected Result: 400 Bad Request ("Attachments are only allowed in Doctor-Admin threads")
    """
    print("\n" + "="*50)
    print("Running: Reject Attachments in User Thread Test")
    print("="*50)
    
    thread = MessageThread.objects.create(participant=normal_user, thread_type="USER_ADMIN")
    
    payload = {
        "body": "Hello",
        "attachments": [{
            "file_url": "http://example.com/file.pdf",
            "file_key": "uploads/test/file.pdf",
            "file_name": "file.pdf",
            "file_size": 1024,
            "file_content_type": "application/pdf"
        }]
    }
    res = authed_client.post(f"/api/v1/chat/threads/{thread.id}/messages/", payload, format="json")
    
    print(f"Response Status: {res.status_code} (Expected: 400)")
    assert res.status_code == 400
    print("Result: PASSED\n")