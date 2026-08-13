# API authorization matrix

This policy is enforced by backend authentication, role permissions, and object-scoped querysets. Client-side route guards and values in browser storage are never authorization controls.

## Actors

| Actor | Definition |
| --- | --- |
| Guest | No authenticated account |
| Patient | Active account with the `USER` role |
| Doctor (unverified) | Active doctor whose verification is pending |
| Doctor (rejected) | Active doctor whose verification was rejected |
| Doctor (approved) | Active doctor whose verification was approved |
| Administrator | Active account with the `ADMIN` role |
| Disabled account | Any account with `is_active=False`; always denied |

## Endpoint policy

`Own` means the object belongs to the authenticated actor. `Public` includes guests. Unless a method is listed, it is not permitted.

| Area | Methods | Guest | Patient | Doctor (unverified/rejected) | Doctor (approved) | Administrator |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication and OTP | POST | Public | Public | Public | Public | Public |
| Own profile and password | GET/PUT/PATCH/POST | No | Own | Own | Own | Own |
| Public doctor list/detail/reviews | GET | Public | Public | Public | Public | Public |
| Doctor like/review creation | POST | No | Approved, active doctors | No | No | No |
| Doctor verification status/submission | GET/POST | No | No | Own | Own | No |
| Available appointment slots | GET | Public | Public | Public | Public | Public |
| Guest appointment/message | POST | Public | Public | Public | Public | Public |
| Patient appointment create/list/cancel | POST/GET/POST | No | Own | No | No | No |
| Thread list | GET | No | Own | No | Own | All |
| Thread get/create | POST | No | Own | No | Own | No |
| Thread messages and read status | GET/POST/PATCH | No | Own | No | Own | All |
| Verification-document upload | POST | No | No | Own | Own | No |
| Chat-attachment upload | POST | No | No | No | Own | Yes |
| System settings | GET | No | Yes | Yes | Yes | Yes |
| System settings update | PATCH | No | No | No | No | Yes |
| User/doctor administration | GET/PATCH/POST | No | No | No | No | Yes |
| Appointment-slot administration | GET/POST/PUT/PATCH/DELETE | No | No | No | No | Yes |
| Clinic availability rules, breaks, overrides, and generation | GET/POST/PUT/PATCH/DELETE | No | No | No | No | Yes |
| Appointment administration/calendar | GET/PUT/PATCH | No | No | No | No | Yes |
| Thread administration | GET/PUT/PATCH/DELETE | No | No | No | No | Yes |

## Object boundaries

- Patients can list and cancel only their own appointments.
- Patients and approved doctors can access only the message thread whose participant is their account.
- Administrators may access all threads, but `assigned_admin` accepts only an active administrator.
- Doctor verification endpoints always resolve the authenticated doctor's profile; they do not accept another doctor's identifier.
- Inactive or non-approved doctors are excluded from public detail, rating, and review targets.
- A disabled account is rejected even if it holds a token issued before deactivation.
- Uploaded media has no public Django route in production. The current upload endpoint authorizes purpose at creation; any future download or multipart-upload endpoints must add owner/admin object checks and corresponding rows to this matrix before release.

## Verification

`tests/test_authorization_matrix.py` parameterizes every application endpoint and implemented method over guest, patient, unverified doctor, rejected doctor, approved doctor, and administrator. It also tests ownership concealment, disabled tokens, assigned-admin validation, upload purposes, inactive doctors, and forged client role headers.
