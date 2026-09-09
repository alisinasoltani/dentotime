# Doctor profiles and insurance-first booking

## Ownership and public presentation

Doctors use `/doctor/edit-info`. The existing account form manages name, username
and the scanned profile-photo upload; the separate public-profile form manages
specialty, biography, experience, clinic, education, clinical history,
certifications, address, HTTP(S) map link, services and accepted insurance.

`GET/PATCH /api/v1/doctors/me/profile/` always resolves the authenticated doctor,
not a caller-supplied ID. Active doctors of every verification status can prepare
their content. Editing does not change approval, role, medical registration or
administrative fields. Only active, approved doctors remain publicly visible and
bookable. Service and insurance selections reference the existing active catalog.

The public detail page reads current profile data on each request. It no longer
invents education, dates, qualifications or free/self-pay acceptance. Blank résumé
fields display an explicit empty state. Free/self-pay (`آزاد`) must be selected
from the catalog like any other accepted option.

## Booking contract

Patient form order: insurance → service → matching doctor → existing date/time and
confirmation steps. Home-page booking uses the same order. Doctor options are
filtered on the server before pagination using both `insurance_id` and `service_id`;
the client loads every matching page. Changing either choice clears the doctor,
date, time and idempotency key. Superseded slot requests are cancelled.

New doctor bookings submit `doctor_id`, `insurance_id`, `service_id`, `slot_id` and
the existing `Idempotency-Key` header. The transactional booking service rechecks
active approval and both active catalog relationships, preserving the existing
doctor-slot ownership and double-booking guards. It locks the doctor before the
slot, matching availability generation/removal lock ordering. Idempotent retries
must retain both catalog choices. The chosen foreign keys are retained on the
appointment and returned as `insurance` and `service` IDs.

Existing appointments are not backfilled with guessed insurance or services.
Legacy unassigned clinic-slot API bookings (no doctor and no catalog selections)
remain supported; the patient UI does not use that compatibility path. Omitting
the doctor cannot book a doctor-owned slot.

## Deployment without resetting data

Deploy the two additive migrations with the backend:

- `accounts.0018_doctor_public_resume`: blank résumé fields.
- `appointments.0010_booking_catalog_choices`: nullable, indexed, protected catalog
  foreign keys, preserving historical appointments.

Then deploy the frontend together with the new doctor-booking request contract.
Existing clients that book a specific doctor must supply both catalog IDs. Keep
the normal database backup and migration process; do not reset or delete volumes.

For the dedicated local demo, from `backend`:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml build backend frontend
docker compose -p dentotime-demo -f docker-compose.demo.yml up -d --no-build --wait --wait-timeout 120 backend frontend file-scanner
```

The setup service runs additive migrations and the initialize-once demo seed.
It does not reset existing demo data. Do not use the demo configuration for production.

## Verification

```powershell
# backend directory: separate test database, not live demo data
docker compose -p dentotime-demo -f docker-compose.demo.yml --profile tests run --rm tests

# frontend directory
npm run typecheck
npm test
npm run lint
npx playwright test --config=playwright.demo.config.ts doctor-profile-booking.spec.ts
```

The opt-in live demo browser test temporarily edits the approved demo doctor's
profile, verifies desktop/mobile rendering, tests dependent selection resets and
empty matches, and books one patient appointment. In `finally`, it restores the
profile and cancels the test appointment through the ordinary API (leaving the
cancelled test record as history). Run only against the dedicated localhost demo.
