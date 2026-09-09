# Dentotime scenario demo

This is a separate demo installation of the real application. PostgreSQL, MinIO,
Redis, API and frontend belong to the `dentotime-demo` Compose project. It does not
read `.env.server` or use the existing `dentotime-review` volumes. The default
configuration binds ports to loopback. For direct public-IP access, use the
[explicit public deployment](#public-demo-on-ubuntu-no-ssh-tunnel) below; do not
publish the local configuration's known signing/storage keys.

## Public demo on Ubuntu (no SSH tunnel)

From `~/dentotime/backend` on the Ubuntu server, after copying/pulling the new
`docker-compose.demo-public.yml` and `scripts/start-public-demo.sh` files:

```bash
sudo bash scripts/start-public-demo.sh 37.32.37.248
```

Replace the IP only if your server has a different address. Bash, OpenSSL, Docker
Engine and Docker Compose 2.24.4 or newer are required. The overlay uses
[`!override`](https://docs.docker.com/reference/compose-file/merge/#replace-value)
to replace loopback port mappings, rather than adding conflicting bindings.

The launcher generates `.env.demo-public` with private, independent signing and
storage keys (mode `600`), then validates, builds and starts the **same dedicated
`dentotime-demo` project**. Re-running it preserves those keys and the demo
database/uploads. It neither reads `.env.server` nor resets any volume. A failed
build leaves the running containers in place. The first switch from local to
public invalidates old sessions/presigned URLs; log in again and retry unfinished
uploads. Keep `.env.demo-public` private and backed up with the demo; never commit it.

After startup, open **<http://37.32.37.248:3100/login> directly from any computer**.
No Windows command, localhost URL or SSH tunnel is required. The initial admin
login is `09120001001` / `DentoDemo2026!`; all roles are listed below.

Expected output includes healthy frontend/backend containers and successful
one-time setup containers. Verify on the server:

```bash
sudo docker compose --env-file .env.demo-public -p dentotime-demo -f docker-compose.demo.yml -f docker-compose.demo-public.yml port frontend 3000
curl -fsS http://127.0.0.1:3100/api/v1/health/
```

The port command must print `0.0.0.0:3100`, not `127.0.0.1:3100`.
Allow inbound **TCP 3100 and 19000** in the hosting provider's network firewall.
Port 19000 serves signed file uploads/downloads; login working does not prove that
uploads work. Keep PostgreSQL, Redis, backend port 18000 and MinIO console 19001
private. Docker-published ports can bypass UFW rules; do not rely on UFW alone to
restrict access. See [Docker's firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw).

This is an intentionally **public, mutable, synthetic-data HTTP demo**, not a
production configuration. Anyone knowing the published accounts can use demo
admin functions and alter/delete demo records. HTTP does not encrypt traffic;
do not enter real patient information, personal passwords or production secrets.
SMS remains captured locally and the scanner remains a test scanner, not malware
protection. For long-lived or restricted demonstrations, add HTTPS and an access
gate; stop the public demo when it is not needed.

Always use the public launcher (or **both** Compose files and `.env.demo-public`)
for later updates. Running the local-only command again switches origins and
signing/storage keys back to the local defaults.

Stop public access without deleting demo data:

```bash
sudo docker compose --env-file .env.demo-public -p dentotime-demo -f docker-compose.demo.yml -f docker-compose.demo-public.yml stop
```

To deliberately reset a public demo, use the same explicit command with
`down --volumes`, then rerun the launcher. **This deletes all demo database and
upload data.** A reset is not required to make an existing demo public.

## Start, preserve, reset

The commands in this section are for a **local-only/private** demo. Public server
deployments must use the launcher above instead.

### Windows PowerShell

From `D:\GitHub\dentotime\backend` in PowerShell:

```powershell
.\scripts\Start-Demo.ps1
```

Open <http://localhost:3100/login>. The normal review site remains on port 3000.
Use **localhost consistently**, and use separate browser profiles for the demo,
review site, administrator, patient and doctor. Cookies are shared across ports
on the same hostname; separate tabs alone do not isolate logins between roles.
The demo uses its own refresh-cookie name so it cannot overwrite the review
installation's refresh cookie, even though both use localhost.

Starting again preserves passwords, approvals, bookings, messages and other
presentation changes. Setup is serialized and commits its database baseline only
when every scenario and document succeeds. Retrying a failed initial setup is safe;
fixed demo storage keys are overwritten on retry. Storage itself is not transactional.

Before a new presentation, restore the baseline and refresh all dates:

```powershell
.\scripts\Start-Demo.ps1 -Reset
```

**Reset deletes only this dedicated demo project's database and uploaded files,
including any changes made during a presentation.** It recreates the demo; there
is no attempt to delete through the application's protected relationships.
The baseline has available slots for 14 days. Reset before presenting if it is old.

Stop and retain the demo data:

```powershell
.\scripts\Start-Demo.ps1 -Stop
```

### Ubuntu / Bash (private demo)

Run these commands from the repository's `backend/` directory (for example,
`~/dentotime/backend`). Do not run `.\scripts\Start-Demo.ps1` in Bash: `.ps1`
is a PowerShell script, not a Linux shell script. No PowerShell installation is
needed; use Docker Compose directly. Omit `sudo` if your user already has Docker
access. The parallel limit keeps builds sequential on a small server.

Start or update the demo, preserving existing presentation data:

```bash
sudo docker compose -p dentotime-demo -f docker-compose.demo.yml config --quiet
sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose -p dentotime-demo -f docker-compose.demo.yml up -d --build --wait --wait-timeout 180
sudo docker compose -p dentotime-demo -f docker-compose.demo.yml ps -a
sudo docker compose -p dentotime-demo -f docker-compose.demo.yml logs --no-color --tail=100 demo-setup
```

`config --quiet` succeeds without output. `demo-setup` runs migrations and
`seed_demo` automatically, then exits with code 0. Its logs show either
`Demo scenarios created.` or `Demo already initialized; presentation changes preserved.`
The API/frontend must be healthy before opening the site. No separate
`seed_rating_demo` command is needed or supported. If startup fails, inspect
`demo-setup` and `backend` logs; a reset is not a general repair step.

Stop without deleting any demo data:

```bash
sudo docker compose -p dentotime-demo -f docker-compose.demo.yml stop
```

**Optional reset: this permanently deletes this demo's database, uploaded files
and presentation changes.** Use it only when you want a fresh baseline. Keep both
the exact `dentotime-demo` project name and `docker-compose.demo.yml` filename;
never substitute the review/production stack or add `.env.server`.

```bash
sudo docker compose -p dentotime-demo -f docker-compose.demo.yml down --volumes
sudo env COMPOSE_PARALLEL_LIMIT=1 docker compose -p dentotime-demo -f docker-compose.demo.yml up -d --build --wait --wait-timeout 180
```

### Private remote demo via SSH (optional)

The demo stays bound to the server's loopback interface. On your own computer,
open a separate PowerShell or terminal window and create an SSH tunnel. Replace
`YOUR_SERVER_IP` and, if necessary, the SSH username `ubuntu`:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:3100:127.0.0.1:3100 -L 127.0.0.1:19000:127.0.0.1:19000 ubuntu@YOUR_SERVER_IP
```

After SSH authentication, a successful tunnel stays open without returning a
shell prompt. Leave that window open, then browse to
<http://localhost:3100/login> on your own computer. Port `19000` is also forwarded
because file uploads/downloads use MinIO. Use `localhost`, not the server IP or
`127.0.0.1`, in the browser so the configured origins match. Press Ctrl+C in the
tunnel window when finished. No public firewall rule for ports 3100/19000 is needed.

If SSH reports that an address is already in use, stop your **local** demo (using
the stop command for your shell) or use another computer; the local ports must be
free. Do not change only the forwarded port: the app's origins also depend on it.
For direct public access, use the public launcher above, which replaces the
known local signing/storage keys. Never copy demo volumes to production.

## Accounts

All accounts start with password **`DentoDemo2026!`**. Inactive accounts intentionally
cannot log in; the administrator can reactivate them. Each record is marked as
synthetic in its display name/profile. Names, phone numbers and files are examples;
SMS never leaves the demo.

| Login | Phone | Scenario |
|---|---|---|
| Administrator | `09120001001` | Main admin: verification, users, appointments, slots, rating configuration, support |
| Administrator | `09120001002` | Second admin: shared inbox and internal notes |
| Patient | `09120001101` | New account, empty history, no rating eligibility; create a booking |
| Patient | `09120001102` | All six appointment statuses, cancellation allowed/too late, favorites, support pagination, direct chat |
| Patient | `09120001103` | Completed attended visit; eligible to submit a first rating |
| Patient | `09120001104` | Future appointment; rating blocked until visit |
| Patient | `09120001105` | Past appointment; confirm attendance before rating |
| Patient | `09120001106` | Existing seven-part rating and comment; edit it |
| Patient | `09120001107` | No-show; rating blocked |
| Patient | `09120001108` | Inactive account; login blocked, admin reactivation |
| Doctor | `09120001201` | Approved primary doctor: calendar, availability, ratings, support and direct chats |
| Doctor | `09120001202` | Approved colleague: separate availability, doctor-to-doctor chat |
| Doctor | `09120001203` | Pending verification with a downloadable synthetic document |
| Doctor | `09120001204` | Rejected verification with reason; correct and resubmit |
| Doctor | `09120001205` | No verification submitted; complete first submission |
| Doctor | `09120001206` | Approved assistant account, supervising doctor filled in |
| Doctor | `09120001207` | Approved clinic account, clinic display name |
| Doctor | `09120001208` | Approved but inactive doctor; login blocked |
| Guest | `09120001199` | No account; seeded guest booking and support message, sign up to claim |

Administrator login: <http://localhost:3100/admin/login> (the public login also
routes administrators correctly). Patients select «مراجعان»; doctors select the
doctor tab. Assistant and clinic are `DOCTOR` account-owner variants, not separate
permission roles. There is no independent receptionist or billing role in this app.

## Presentation route

1. **Guest discovery and booking:** open `/doctors`, then
   `/doctors/demo-doctor-approved`. Browse service/insurance filters and real
   available slots. Submit a guest booking through the real CAPTCHA. Use guest
   phone `09120001199` when demonstrating signup and claiming the seeded booking.
2. **Patient booking lifecycle:** log in as `09120001102`, open
   `/user/appointments`. Pending, approved, rejected, cancelled, completed and
   no-show entries are available (their API reason fields carry `[DEMO]` markers). Cancel a future pending/approved booking;
   the `cancellation-cutoff` example is only two hours away and should reject
   patient cancellation under the default 24-hour policy. Use `09120001101` to
   demonstrate booking into an empty account.
3. **Doctor work:** log in as `09120001201`, open `/doctor/appointments`. Inspect
   the calendar, add/remove availability, cancel an appointment, and compare with
   the colleague's calendar to show ownership isolation. A booked slot cannot be
   removed until its appointment is handled.
4. **Verification:** compare doctors `1205` (new), `1203` (pending) and `1204`
   (rejected). As admin, open `/admin/requests`, download a sample document, then
   approve or reject the pending doctor. Log back in as that doctor to show the
   changed permissions. Synthetic PNG documents can be downloaded and reused to
   demonstrate the real upload, scan and resubmission path.
5. **Ratings:** at `/doctors/demo-doctor-approved`, compare patients `1101`, `1103`,
   `1104`, `1105`, `1106`, and `1107` using the table above. Confirm attendance for
   `1105` through `/user/appointments`. Submit/update all seven answers, then show
   the public aggregate, `/doctor/ratings`, and the admin doctor voter view.
6. **Messaging:** open patient `/user/chat`, doctor `/doctor/chat`, admin
   `/admin/chat` in separate profiles. Send a message and watch it arrive. The
   two support threads contain 55 messages each so pagination is visible.
   Administrator-only notes must never appear for the patient or doctor. Show
   doctor-to-patient and doctor-to-doctor direct conversations. The doctor support
   thread contains a real private PNG attachment. Test uploading a new file,
   retry/resume, and authorization through the normal controls.
7. **Administration:** show `/admin/users`, `/admin/doctors`, `/admin/appointments`,
   `/admin/slots`, `/admin/rating-parameters`. Reactivate an inactive example and
   log in again. Change rating parameters only after the rating demonstration;
   reset before the next presentation.
8. **Signup, password recovery/change and guest claim:** request a normal OTP in
   the app, then read it from the local inbox below. Enter the actual random code;
   validation, expiry and attempt limits still apply. Use a new phone for signup,
   or `09120001199` for guest claim. Existing account phones cannot sign up again.

Read the last 20 captured SMS messages, including real generated OTP codes:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml exec backend python manage.py demo_sms
```

Messages stay in the isolated database (latest 100 only), not in API responses or
server logs. No SMS.ir credentials, fixed OTP or authentication bypass is used.
The demo uses the existing local test scanner; it demonstrates upload/integrity
and scanning states, not ClamAV's production malware detection. Interrupted upload,
throttling, wrong CAPTCHA/OTP and validation errors are exercised through the app,
not fabricated as successful records. No payment functionality is simulated.

## Production boundary

- The ordinary Docker image excludes `demo/` and all `.env*` files. Only the demo
  Compose file mounts the demo code and selects `demo.settings`.
- Demo settings refuse production mode, any database except `dentotime_demo`
  on `demo-postgres`, and any bucket except `dentotime-demo`. Each demo command
  also verifies the actual connected PostgreSQL database. Setup refuses a
  pre-populated application database without a completed demo marker.
- Old `populate_db` and `seed_rating_demo` commands now fail with a migration
  message and perform no writes. Changing `DJANGO_ENVIRONMENT` on an `exec`
  command cannot re-enable these entry points.
- Historical migration names and dependencies remain intact. Their sample-user
  and sample-visit functions are now no-ops; migration `0016` still installs
  services and insurances, while rating-question migrations remain unchanged.
  Fresh normal databases contain reference data but no fictional people/reviews.
  Applied migrations are not rerun, and no existing record is silently removed.
- Before promoting an **existing** database, run this read-only release gate in
  the candidate backend environment:

  ```sh
  python manage.py migrate --noinput
  python manage.py check_demo_data
  python manage.py ensure_system_admin --if-configured
  ```

  `check_demo_data` reports known sample identities, sample visits/registrations
  and the demo schema, and exits nonzero. Inspect flagged records against real
  ownership before a separately planned cleanup or fresh production database.
  Phone matches are candidates for investigation, not proof that a person is fake.
  Do not copy the demo volume or captured SMS into production. The existing review
  database already contains older demo data and must be audited before promotion.
- The HTTP review Compose migration service runs this gate automatically when
  `DJANGO_ENVIRONMENT=production`. HTTP review itself is not a production recipe;
  TLS, production secrets, verified database TLS, private storage, ClamAV and
  backup/restore testing still follow `LOCAL_AND_SERVER_DEPLOYMENT.md`.
- The direct-chat fix is a normal new schema migration (`messaging.0007`),
  separating guest uniqueness from direct participant pairs. No records are deleted.

## Verification

With demo infrastructure running:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml --profile tests run --rm tests
```

The tests use a separate `test_dentotime_demo` PostgreSQL database and mocked S3,
and run both scenario tests and the normal backend regression suite. They cover
rerun preservation, rollback/retry, authentication, verification/rating states,
private files/internal notes, production guards, and empty normal migrations.
The test-only dependencies are installed only inside this disposable test container.

For real browser regressions, run from `frontend/` after rebuilding the demo:

```powershell
npx playwright test --config=playwright.demo.config.ts
```

This opt-in Edge test checks desktop/mobile chat bounds and RTL ordering, calendar
circle alignment, and admin → logout → rejected doctor → patient → admin login
in the same browser context. It also verifies that demo logout preserves a
separate review-session cookie. It does not reset the scenario data.
