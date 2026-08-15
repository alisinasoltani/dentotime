# ==========================================
# DENTOTIME API FULL ROUTE TEST SCRIPT
# ==========================================
 $BaseUrl = "http://127.0.0.1:8000/api/v1"

# --- UPDATE THESE CREDENTIALS TO MATCH YOUR DATABASE ---
 $AdminPhone = "+12025550143"
 $AdminPass = "TestPass123!"

 $DoctorPhone = "+12025550145"
 $DoctorPass = "TestPass123!"

 $UserPhone = "+12025550144"
 $UserPass = "TestPass123!"
# ------------------------------------------------------

 $Headers = @{ "Content-Type" = "application/json" }

function Invoke-Request {
    param([string]$Method, [string]$Url, [string]$Body, [string]$Token)
    $FullUrl = "$BaseUrl$Url"
    $RequestHeaders = $Headers.Clone()
    if ($Token) {
        $RequestHeaders["Authorization"] = "Bearer $Token"
    }

    Write-Host "[$Method] $FullUrl" -NoNewline
    try {
        if ($Body) {
            $response = Invoke-RestMethod -Uri $FullUrl -Method $Method -Headers $RequestHeaders -Body $Body
        } else {
            $response = Invoke-RestMethod -Uri $FullUrl -Method $Method -Headers $RequestHeaders
        }
        Write-Host " -> SUCCESS" -ForegroundColor Green
        return $response
    } catch {
        Write-Host " -> FAILED ($($_.Exception.Response.StatusCode.value__))" -ForegroundColor Red
        Write-Host $_.ErrorDetails.Message -ForegroundColor DarkGray
        return $null
    }
}

Write-Host "`n=== 1. AUTHENTICATION ===" -ForegroundColor Cyan
 $AdminLoginBody = @{ phone_number = $AdminPhone; password = $AdminPass; user_type = "ADMIN" } | ConvertTo-Json
 $AdminRes = Invoke-Request -Method POST -Url "/auth/login/" -Body $AdminLoginBody
 $AdminToken = $AdminRes.access

 $DoctorLoginBody = @{ phone_number = $DoctorPhone; password = $DoctorPass; user_type = "DOCTOR" } | ConvertTo-Json
 $DoctorRes = Invoke-Request -Method POST -Url "/auth/login/" -Body $DoctorLoginBody
 $DoctorToken = $DoctorRes.access

 $UserLoginBody = @{ phone_number = $UserPhone; password = $UserPass; user_type = "USER" } | ConvertTo-Json
 $UserRes = Invoke-Request -Method POST -Url "/auth/login/" -Body $UserLoginBody
 $UserToken = $UserRes.access

Write-Host "`n=== 2. CORE & SETTINGS ===" -ForegroundColor Cyan
Invoke-Request -Method GET -Url "/settings/" -Token $UserToken
 $SettingsBody = @{ cancellation_cutoff_hours = 12 } | ConvertTo-Json
Invoke-Request -Method PATCH -Url "/settings/" -Body $SettingsBody -Token $AdminToken

Write-Host "`n=== 3. USER & PROFILE MANAGEMENT ===" -ForegroundColor Cyan
Invoke-Request -Method GET -Url "/users/me/" -Token $UserToken
 $UpdateUserBody = @{ username = "testuser_updated" } | ConvertTo-Json
Invoke-Request -Method PATCH -Url "/users/me/" -Body $UpdateUserBody -Token $UserToken
 $ChangePassBody = @{ old_password = $UserPass; new_password = "NewPass123!" } | ConvertTo-Json
Invoke-Request -Method POST -Url "/users/me/change-password/" -Body $ChangePassBody -Token $UserToken

Write-Host "`n=== 4. DOCTOR VERIFICATION ===" -ForegroundColor Cyan
Invoke-Request -Method GET -Url "/doctors/verification/" -Token $DoctorToken
 $VerifyBody = @{ 
    account_owner = "DOCTOR"; agreed_to_terms = $true; 
    id_number = "12345"; medical_registration_number = "MED-999";
    documents = @(@{ file_url="http://s3.com/doc.pdf"; file_key="uploads/doctors/1/doc.pdf"; file_name="doc.pdf"; file_size=1024; file_content_type="application/pdf" })
} | ConvertTo-Json -Depth 5
Invoke-Request -Method POST -Url "/doctors/verification/submit/" -Body $VerifyBody -Token $DoctorToken

Write-Host "`n=== 5. ADMIN MANAGEMENT ===" -ForegroundColor Cyan
Invoke-Request -Method GET -Url "/admin/users/" -Token $AdminToken
Invoke-Request -Method GET -Url "/admin/doctors/?verification_status=PENDING" -Token $AdminToken
 $DoctorId = $DoctorRes.user.id
Invoke-Request -Method POST -Url "/admin/doctors/$DoctorId/approve/" -Token $AdminToken
Invoke-Request -Method PATCH -Url "/admin/users/$DoctorId/deactivate/" -Token $AdminToken
Invoke-Request -Method PATCH -Url "/admin/users/$DoctorId/reactivate/" -Token $AdminToken

Write-Host "`n=== 6. APPOINTMENTS ===" -ForegroundColor Cyan
# Admin creates a slot
 $SlotBody = @{ 
    date = "2025-12-01"; 
    start_at = "2025-12-01T10:00:00Z"; 
    end_at = "2025-12-01T11:00:00Z" 
} | ConvertTo-Json
 $SlotRes = Invoke-Request -Method POST -Url "/admin/appointments/slots/" -Body $SlotBody -Token $AdminToken
 $SlotId = $SlotRes.id

# User lists slots and books one
Invoke-Request -Method GET -Url "/appointments/slots/" -Token $UserToken
 $BookBody = @{ slot_id = $SlotId; reason = "Toothache" } | ConvertTo-Json
 $ApptRes = Invoke-Request -Method POST -Url "/appointments/" -Body $BookBody -Token $UserToken
 $ApptId = $ApptRes.id

# User and Admin view appointments
Invoke-Request -Method GET -Url "/appointments/me/" -Token $UserToken
Invoke-Request -Method GET -Url "/admin/appointments/" -Token $AdminToken
Invoke-Request -Method GET -Url "/admin/appointments/calendar/?month=2025-12" -Token $AdminToken

# Admin approves the appointment
 $ApproveApptBody = @{ status = "APPROVED"; admin_notes = "See you then" } | ConvertTo-Json
Invoke-Request -Method PATCH -Url "/admin/appointments/$ApptId/" -Body $ApproveApptBody -Token $AdminToken

Write-Host "`n=== 7. MESSAGING & CHAT ===" -ForegroundColor Cyan
# User starts a thread and sends a message
 $ThreadRes = Invoke-Request -Method POST -Url "/chat/threads/get_or_create/" -Token $UserToken
 $ThreadId = $ThreadRes.id
 $MsgBody = @{ body = "Hello Admin!" } | ConvertTo-Json
Invoke-Request -Method POST -Url "/chat/threads/$ThreadId/messages/" -Body $MsgBody -Token $UserToken

# Admin lists threads and reads the message
Invoke-Request -Method GET -Url "/chat/threads/" -Token $AdminToken
Invoke-Request -Method GET -Url "/chat/threads/$ThreadId/messages/" -Token $AdminToken
Invoke-Request -Method PATCH -Url "/chat/threads/$ThreadId/read/" -Token $AdminToken

# Doctor starts a thread (now that they are approved)
 $DocThreadRes = Invoke-Request -Method POST -Url "/chat/threads/get_or_create/" -Token $DoctorToken
 $DocThreadId = $DocThreadRes.id
 $DocMsgBody = @{ body = "Hello from Doctor!" } | ConvertTo-Json
Invoke-Request -Method POST -Url "/chat/threads/$DocThreadId/messages/" -Body $DocMsgBody -Token $DoctorToken

Write-Host "`n=== 8. FILE UPLOADS (Presign) ===" -ForegroundColor Cyan
 $PresignBody = @{ 
    purpose = "chat_attachment"; 
    file_name = "scan.stl"; 
    file_size = 52428800; 
    file_content_type = "model/stl" 
} | ConvertTo-Json
Invoke-Request -Method POST -Url "/files/presign/" -Body $PresignBody -Token $DoctorToken

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Cyan
Write-Host "Go to http://127.0.0.1:8000/silk/ to view the profiling data for all these requests!"