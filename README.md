# Dentotime

Dentotime is a Persian/RTL dental appointment application with patient, doctor,
and administrator accounts. The stack is Next.js, Django/DRF, PostgreSQL, Redis,
and MinIO file storage.

This guide takes a new Windows machine from **WSL installation → Docker Desktop
integration → repository clone → application build → running scenario demo**.
The demo runs the real application with isolated sample data; there is no separate
frontend-only demo to start. Python, Node.js, PostgreSQL, and Redis do **not** need
to be installed directly on Windows for this Docker workflow.

Repository: [github.com/alisinasoltani/dentotime](https://github.com/alisinasoltani/dentotime).

## How to follow this guide

- Run every `powershell` block in **Windows PowerShell 5.1 or PowerShell 7**, not
  Command Prompt, Git Bash, or an Ubuntu shell. Do not copy the output blocks.
- Only the WSL installation/restart steps require an **Administrator** PowerShell
  window. Use your normal Windows account for Docker and the project afterward;
  accept an installer elevation prompt if required.
- Commands using `wsl.exe ... --exec ...` are still entered in PowerShell; they
  explicitly run one command inside Ubuntu and return to PowerShell.
- Output examples are **representative success indicators**, not exact transcripts.
  Versions, language, timing, progress bars, image hashes, and test counts vary.
  A command with no output may have succeeded. Stop on an error before continuing.
- Examples store the checkout at `D:\GitHub\dentotime`. If you do not have D:,
  substitute another writable folder with enough space throughout the guide.

### Contents

1. [Check prerequisites](#1-check-prerequisites)
2. [Install WSL 2 and Ubuntu](#2-install-wsl-2-and-ubuntu)
3. [Install Git and Docker Desktop](#3-install-git-and-docker-desktop)
4. [Connect Docker Desktop to WSL](#4-connect-docker-desktop-to-wsl)
5. [Clone and check the repository](#5-clone-and-check-the-repository)
6. [Build the project](#6-build-the-project)
7. [Start and verify the demo](#7-start-and-verify-the-demo)
8. [Log in with every demo account](#8-log-in-with-every-demo-account)
9. [Demonstrate the features](#9-demonstrate-the-features)
10. [Stop, restart, update, or reset](#10-stop-restart-update-or-reset)
11. [Troubleshooting and tests](#11-troubleshooting-and-tests)
12. [Non-demo and production deployments](#12-non-demo-and-production-deployments)

## 1. Check prerequisites

Use a supported 64-bit Windows release; an up-to-date Windows 11 installation is
recommended. Enable CPU virtualization in BIOS/UEFI. In **Task Manager →
Performance → CPU**, check that **Virtualization** says **Enabled**.

Docker currently requires WSL **2.1.5 or newer** and at least **8 GB system RAM**.
For this multi-container project, **16 GB RAM is recommended**. Check the current
[Docker Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/)
for supported Windows editions/builds and Docker Desktop license terms.

Allow **at least 20 GB free on the drive holding Docker's data**, with **50 GB
recommended for repeated builds and caches**. These are project planning budgets,
not fixed download sizes. Also leave free space on the Windows system drive.
Putting this Git checkout on D: does **not** move Docker/WSL's virtual disks off C:.

Check Windows:

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
```

Expected output, for example:

```text
Caption                     Version          BuildNumber
-------                     -------          -----------
Microsoft Windows 11 Pro    10.0.<build>      <build>
```

Check available space:

```powershell
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{Name='FreeGB';Expression={[math]::Round($_.Free / 1GB, 1)}}
```

Expected output: a table of your drives and their actual free space, for example:

```text
Name FreeGB
---- ------
C      55.2
D     120.4
```

If C: is nearly full, fix that **before** installing or building. Docker's data
location can be changed through its supported settings after installation; see
[disk-space troubleshooting](#docker-reports-read-only-file-system-or-inputoutput-error).

## 2. Install WSL 2 and Ubuntu

### 2.1 Enable WSL

Open the Start menu, search for **PowerShell**, and choose **Run as administrator**.
On a fresh machine, run:

```powershell
wsl.exe --install -d Ubuntu --no-launch
```

Expected output: WSL/Virtual Machine Platform installation progress, Ubuntu
installation progress, and possibly a restart-required message:

```text
Installing: Virtual Machine Platform
Installing: Windows Subsystem for Linux
The requested operation is successful. Changes will not be effective until the system is rebooted.
```

The distribution download may finish before or after the restart. Already having
WSL installed is not an error; use the checks below instead of reinstalling it.
This follows [Microsoft's WSL installation procedure](https://learn.microsoft.com/en-us/windows/wsl/install).

### 2.2 Restart Windows if requested

**Save your work first.** This command restarts the entire computer:

```powershell
Restart-Computer
```

Expected result: Windows restarts; there is no useful console output to wait for.
After signing in, open a new PowerShell window.

### 2.3 Update WSL and choose version 2

```powershell
wsl.exe --update
```

Expected output: an update completes, or a message says the latest WSL version is
already installed.

```powershell
wsl.exe --set-default-version 2
```

Expected output:

```text
The operation completed successfully.
```

Check installed distributions:

```powershell
wsl.exe --list --verbose
```

Expected output includes Ubuntu with **VERSION 2**; `Running` or `Stopped` is fine:

```text
  NAME      STATE       VERSION
* Ubuntu    Stopped     2
```

If there are no distributions, install Ubuntu now:

```powershell
wsl.exe --install -d Ubuntu --no-launch
```

Expected output: Ubuntu downloads and installs successfully. If Ubuntu already
appears, skip this installation command.

If Ubuntu's version is **1**, convert that distribution:

```powershell
wsl.exe --set-version Ubuntu 2
```

Expected output: conversion progress, followed by successful completion. Skip
this command when the distribution already uses version 2.

**Use the exact distribution name from the list.** For example, an existing
installation may be named `Ubuntu-26.04`; replace `Ubuntu` in later commands with
that name. Do not install a second Ubuntu just to match the examples.

### 2.4 Create your Ubuntu user

```powershell
wsl.exe -d Ubuntu
```

Expected first-launch interaction:

```text
Create a default Unix user account: <choose-a-linux-username>
New password:
Retype new password:
<linux-username>@<computer>:...$
```

Choose your own Linux username/password. Password characters are not displayed
while typing. This is **not** a Dentotime demo account or password. If a Linux
user already exists, you will simply see its shell prompt.

At the Ubuntu prompt, press **Ctrl+D** to return to the Windows `PS ...>` prompt.
All remaining command blocks belong in PowerShell.

```powershell
wsl.exe --version
wsl.exe -d Ubuntu --exec whoami
```

Expected output:

```text
WSL version: <installed-version>
Kernel version: <installed-kernel>
...
<your-linux-username>
```

Keep WSL current. Distribution `VERSION 2` and the WSL package version such as
`2.7.x` are different checks. See [Microsoft's WSL command reference](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

## 3. Install Git and Docker Desktop

### 3.1 Check Windows Package Manager

In a normal PowerShell window:

```powershell
winget --version
```

Expected output:

```text
v<installed-version>
```

If `winget` is not recognized, install/update **App Installer** from the Microsoft
Store, reopen PowerShell, and retry. On managed machines, follow your IT policy.
You can alternatively use the official [Git for Windows installer](https://git-scm.com/downloads/win)
and [Docker Desktop installer](https://docs.docker.com/desktop/setup/install/windows-install/).

### 3.2 Install Git

```powershell
winget install --id Git.Git --exact --source winget --interactive
```

Expected output: Git is found, its installer opens, and WinGet reports successful
installation. In the installer, keep Git available from the command line. Review
and accept the applicable prompts yourself. If it is already current, WinGet may
report that no applicable upgrade is available.

### 3.3 Install Docker Desktop for Windows

```powershell
winget install --id Docker.DockerDesktop --exact --source winget --interactive
```

Expected output: the Docker Desktop installer opens and completes successfully.
Choose the **WSL 2 backend** if asked, review the license, and restart Windows if
the installer requires it. See [WinGet installation options](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).

Do **not** also install a separate Docker Engine with Ubuntu's package manager
for this workflow. Use Docker Desktop's engine and its WSL integration.

Close and reopen PowerShell so the new PATH entries are available:

```powershell
git --version
docker --version
docker compose version
```

Expected output:

```text
git version <installed-version>.windows.<revision>
Docker version <installed-version>, build <build-id>
Docker Compose version v<installed-version>
```

This project uses **`docker compose`**, with a space. A separate legacy
`docker-compose` installation is unnecessary. CLI version output alone does not
prove the Docker engine is running; perform the next step too.

## 4. Connect Docker Desktop to WSL

### 4.1 Open Docker Desktop

Start **Docker Desktop** from the Windows Start menu, or use this PowerShell block
to handle both per-user and all-users installation locations:

```powershell
$dockerDesktopPath = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $dockerDesktopPath) { throw 'Open Docker Desktop from the Start menu, or finish its installation first.' }
Start-Process -FilePath $dockerDesktopPath
```

Expected result: no normal console output; Docker Desktop opens. Complete its
first-run prompts and wait until it reports that the engine is running.

### 4.2 Enable the integration in Docker's interface

These are required **GUI actions**, not additional Linux installation commands:

1. Open **Docker Desktop → Settings → General**.
2. Enable **Use the WSL 2 based engine**, if the option is shown. It may already
   be enabled by default and hidden on supported installations.
3. Open **Settings → Resources → WSL Integration**.
4. Enable integration for your Ubuntu distribution. If it is the default
   distribution, also enable integration with the default WSL distribution.
5. Select **Apply / Apply & restart** and wait for the engine.

If WSL Integration is missing, Docker may be in Windows-container mode: choose
**Switch to Linux containers** from the Docker taskbar menu. This application
needs **Linux containers**. See [Docker's WSL integration guide](https://docs.docker.com/desktop/features/wsl/).

### 4.3 Verify Windows and Ubuntu can reach Docker

From PowerShell:

```powershell
docker version
```

Expected output contains **both** `Client:` and `Server:` sections. A connection
or named-pipe error instead of `Server:` means Docker Desktop is not ready.

```powershell
docker info --format '{{.OSType}}'
wsl.exe -d Ubuntu --exec docker info --format '{{.OSType}}'
```

Expected output:

```text
linux
linux
```

Run a small container through Ubuntu, while still typing in PowerShell:

```powershell
wsl.exe -d Ubuntu --exec docker run --rm hello-world
```

Expected output includes:

```text
Hello from Docker!
```

The first run may first pull the image. The test container is automatically
removed when it exits. If Ubuntu reports `docker: command not found`, revisit
WSL Integration; do not install another engine to work around it.

## 5. Clone and check the repository

### 5.1 Create the parent folder

```powershell
New-Item -ItemType Directory -Path 'D:\GitHub' -Force | Out-Null
Set-Location 'D:\GitHub'
```

Expected result: no output; the prompt is now `PS D:\GitHub>`.

### 5.2 Clone Dentotime

```powershell
git clone https://github.com/alisinasoltani/dentotime.git
```

Expected output, abbreviated:

```text
Cloning into 'dentotime'...
Receiving objects: 100% (...), done.
Resolving deltas: 100% (...), done.
```

If access is restricted, authenticate through Git's normal GitHub sign-in prompt;
do not put a personal access token into the clone URL. If the folder already
contains your checkout, skip cloning—do not delete it.

```powershell
Set-Location 'D:\GitHub\dentotime'
git remote get-url origin
```

Expected output:

```text
https://github.com/alisinasoltani/dentotime.git
```

### 5.3 Verify the selected branch includes the demo

```powershell
@(
    '.\backend\docker-compose.demo.yml'
    '.\backend\scripts\Start-Demo.ps1'
    '.\backend\demo\settings.py'
    '.\backend\docs\demo.md'
    '.\frontend\Dockerfile'
) | ForEach-Object {
    if (-not (Test-Path -LiteralPath $_)) { throw "Required file missing: $_. Obtain the published demo-enabled branch before continuing." }
}
Write-Output 'Demo checkout is complete.'
```

Expected output:

```text
Demo checkout is complete.
```

**Release prerequisite:** the demo code and this guide must be committed and
pushed to the branch you clone. GitHub cannot supply a maintainer's uncommitted
or untracked local files. If this check fails, obtain the complete published
demo-enabled branch; do not create empty replacement files or run an older seed
command. The clone command above uses the repository's default branch.

## 6. Build the project

All remaining Docker/demo commands, unless stated otherwise, run from **`backend`**:

```powershell
Set-Location 'D:\GitHub\dentotime\backend'
```

Expected result: no output; the prompt becomes `PS D:\GitHub\dentotime\backend>`.

No `.env`, `.env.server`, API key, host Python installation, or host npm install
is needed for this demo. Do not copy a production environment file into it.

Build the backend and frontend:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml build backend frontend
if ($LASTEXITCODE -ne 0) { throw 'Build failed; fix the reported error before starting the demo.' }
```

Expected output, abbreviated:

```text
... pip installs the locked backend requirements, or reuses the cached layer ...
... Creating an optimized production build ...
... Compiled successfully ...
... Generating static pages ...
Image dentotime-demo-backend Built
Image dentotime-demo-frontend Built
```

The first build can take several minutes and requires internet access. Later
builds reuse unchanged layers. The backend Dockerfile already uses the requested
Python package mirror, **`https://mirror-pypi.runflare.com/simple`**, with the locked
requirements and hash verification. There is no separate Windows `pip install`
step. That mirror covers Python packages, not npm packages or Docker images.

## 7. Start and verify the demo

### 7.1 Start the real application and initialize demo scenarios

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml up -d --no-build --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Demo startup failed or timed out; inspect the service logs before retrying.' }
```

Expected output: database, cache, and storage become healthy; initialization
services complete; the backend and frontend become healthy:

```text
... demo-postgres ... Healthy
... demo-redis ... Healthy
... demo-minio ... Healthy
... demo-storage-init ... Exited
... demo-setup ... Exited
... backend ... Healthy
... frontend ... Healthy
... file-scanner ... Started / running
```

The setup service creates the storage bucket, applies migrations, and seeds all
demo accounts/scenarios **once**. You do not need to execute a second seed command.
Running startup again preserves changed passwords, verification decisions,
appointments, messages, and uploaded files. Compose waits for dependency readiness;
see [Docker's Compose startup reference](https://docs.docker.com/reference/cli/docker/compose/up/).

### 7.2 Check service status and setup logs

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml ps -a
```

Expected rows, summarized (actual output also includes image, command, and ports):

```text
SERVICE             STATUS
backend             Up ... (healthy)
frontend            Up ... (healthy)
demo-postgres       Up ... (healthy)
demo-redis          Up ... (healthy)
demo-minio          Up ... (healthy)
file-scanner        Up ...
demo-storage-init   Exited (0)
demo-setup          Exited (0)
```

`Exited (0)` is **success** for the two one-time setup services. `file-scanner`
is a background worker without its own health check. An exit code other than
zero, repeated restarts, or an unhealthy web/database service needs investigation.

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml logs --tail 30 demo-setup
```

Expected first-start output includes:

```text
... Applying ... OK
Demo scenarios created.
Guide: docs/demo.md | Login: http://localhost:3100/login | Password: DentoDemo2026!
```

On subsequent starts, expect instead:

```text
No migrations to apply.
Demo already initialized; presentation changes preserved.
```

### 7.3 Check HTTP access, database/cache readiness, and migrations

```powershell
(Invoke-WebRequest -UseBasicParsing 'http://localhost:3100/api/v1/health/').Content
(Invoke-WebRequest -UseBasicParsing 'http://localhost:3100/api/v1/ready/').Content
(Invoke-WebRequest -UseBasicParsing 'http://localhost:3100/doctors/demo-doctor-approved').StatusCode
```

Expected output:

```text
{"status":"ok"}
{"status":"ready"}
200
```

The readiness endpoint checks PostgreSQL and Redis; it is not a complete file
upload or end-to-end booking test.

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml exec -T backend python manage.py check
docker compose -p dentotime-demo -f docker-compose.demo.yml exec -T backend python manage.py migrate --check
```

Expected output:

```text
System check identified no issues (0 silenced).
```

The second command normally prints nothing and exits successfully when all
migrations have been applied. It should not report unapplied migrations.

### 7.4 Open the demo

```powershell
Start-Process 'http://localhost:3100/login'
```

Expected result: your default browser opens the login page; no console output.

| Address | Purpose |
|---|---|
| [localhost:3100](http://localhost:3100) | Application home page |
| [localhost:3100/login](http://localhost:3100/login) | Patient/doctor login |
| [localhost:3100/admin/login](http://localhost:3100/admin/login) | Administrator login |
| [Approved demo doctor](http://localhost:3100/doctors/demo-doctor-approved) | Public doctor profile |
| [localhost:18000/api/v1/health/](http://localhost:18000/api/v1/health/) | Direct backend health check |
| [localhost:19000](http://localhost:19000) | MinIO API used by browser uploads; not an app login page |
| [localhost:19001](http://localhost:19001) | Optional MinIO console |

MinIO console credentials, **local demo only**: username `dentotime-demo`, password
`local-demo-storage-password`. These are storage credentials, not application users.

Use **`localhost` consistently**; do not alternate it with `127.0.0.1` in the
browser. The separate non-demo/review installation normally uses port **3000**,
not 3100, and does not share the demo accounts or database.

## 8. Log in with every demo account

These are the baseline accounts from [the scenario guide](backend/docs/demo.md)
and [the seed implementation](backend/demo/seed.py). Passwords include the final
**`!`** and are case-sensitive. Enter phone numbers as shown, preserving the first
zero. The browser converts them to the API's international phone format.

| Login type | Phone number | Initial password | Baseline scenario / expected behavior |
|---|---|---|---|
| Administrator | `09120001001` | `DentoDemo2026!` | Main admin: verification, users, appointments, slots, ratings configuration, support |
| Administrator | `09120001002` | `DentoDemo2026!` | Second admin: shared inbox and administrator-only internal notes |
| Patient | `09120001101` | `DentoDemo2026!` | New patient; empty history, no rating eligibility; create a booking |
| Patient | `09120001102` | `DentoDemo2026!` | All six appointment statuses, cancellation boundaries, favorites, support pagination, direct chat |
| Patient | `09120001103` | `DentoDemo2026!` | Completed attended visit; eligible to submit a first rating |
| Patient | `09120001104` | `DentoDemo2026!` | Future appointment; rating blocked until the visit |
| Patient | `09120001105` | `DentoDemo2026!` | Past appointment; confirm attendance before rating |
| Patient | `09120001106` | `DentoDemo2026!` | Existing seven-part rating and comment; edit the rating |
| Patient | `09120001107` | `DentoDemo2026!` | No-show; rating blocked |
| Patient | `09120001108` | `DentoDemo2026!` | **Inactive: login intentionally blocked** until an administrator reactivates it |
| Doctor | `09120001201` | `DentoDemo2026!` | Approved primary doctor; public profile editor, calendar, availability, ratings, support/direct chats |
| Doctor | `09120001202` | `DentoDemo2026!` | Approved colleague; independent availability and doctor-to-doctor chat |
| Doctor | `09120001203` | `DentoDemo2026!` | Pending verification with a synthetic downloadable document; login allowed, approval-gated features restricted |
| Doctor | `09120001204` | `DentoDemo2026!` | Rejected verification with a reason; login allowed, correct and resubmit |
| Doctor | `09120001205` | `DentoDemo2026!` | Verification not submitted; login allowed, complete the first submission |
| Doctor / assistant | `09120001206` | `DentoDemo2026!` | Approved assistant-owned doctor account with supervising doctor information |
| Doctor / clinic | `09120001207` | `DentoDemo2026!` | Approved clinic-owned doctor account with clinic display name |
| Doctor | `09120001208` | `DentoDemo2026!` | Approved but **inactive: login intentionally blocked** |
| Guest identity | `09120001199` | **None — no login account exists** | Seeded guest booking/support conversation; sign up to claim it and choose a password |

There are **18 seeded login accounts** (16 active, 2 intentionally inactive),
plus **one guest identity with no password**. Do not try to log in as the guest
before signing up. Starting the demo again does not undo password changes made
during testing; the table describes a fresh baseline.

### Choose the right login screen

- **Administrators:** use [the admin login](http://localhost:3100/admin/login).
  The public patient login also routes administrator accounts correctly.
- **Patients:** use [the public login](http://localhost:3100/login), select
  **«بخش مراجعان»**, and enter a patient phone/password.
- **Doctors, assistants, and clinics:** on that same page, select
  **«بخش پزشکان»**. Assistant and clinic are variants of the `DOCTOR` role, not
  separate login roles. There is no independent receptionist or billing role.
- Active pending/rejected/new doctors can sign in and prepare their profile at
  `/doctor/edit-info`, but public visibility and booking require approval.

For simultaneous role demonstrations, use **separate browser profiles or separate
browsers**. Tabs in the same browser profile share the login cookie. Separate
private windows may also share one private session. For sequential switching,
log out through the app before signing in as the next role. The demo has a separate
refresh-cookie name from the review installation, but all demo roles still share
one session per browser profile.

## 9. Demonstrate the features

1. **Public discovery:** open the approved doctor's public page; inspect its
   profile, services, insurance, address, and ratings.
2. **Doctor-owned profile:** sign in as `09120001201`, open `/doctor/edit-info`,
   and enter specialty, biography, professional history, education, certificates,
   clinic/address/map link, services, and accepted insurance. Save and revisit
   the public profile. Empty résumé fields do not invent qualifications.
3. **Insurance-first booking:** as `09120001101` or `09120001102`, open
   `/user/appointments` and create a new appointment. Select **insurance → service
   → matching doctor → date/time**, then submit. Changing insurance or service
   clears the old doctor/date/time. “آزاد” is an explicit insurance-catalog choice.
4. **Doctor matching:** temporarily give the colleague a different combination
   of insurance/services, then compare the patient's doctor lists. The baseline
   approved doctors share some choices, so changing these makes the filtering
   distinction visible. Restore those profile choices after the demonstration.
5. **Appointment lifecycle:** `09120001102` has pending, approved, rejected,
   cancelled, completed, and no-show examples. Show the administrator's review,
   doctor calendar/availability, and patient cancellation limits. Booked slots
   cannot simply be removed.
6. **Verification:** compare doctors `09120001205`, `09120001203`, and
   `09120001204`. As admin, use `/admin/requests` to review a synthetic document
   and approve/reject an application. Log in again as that doctor to see access
   changes.
7. **Ratings:** compare patients `09120001103` through `09120001107`; demonstrate
   attendance confirmation, eligibility, first submission, and editing a rating.
8. **Chat:** use `/user/chat`, `/doctor/chat`, and `/admin/chat` in separate
   browser profiles. Test direct chat, history pagination, attachments, and
   internal notes that must remain administrator-only.
9. **Inactive accounts:** use admin user/doctor management to reactivate either
   inactive account, then verify that it can log in.
10. **Signup/OTP/guest claim:** use a new phone for signup, or `09120001199` to
    demonstrate claiming the seeded guest record. Existing accounts cannot sign
    up again. Read the real generated demo OTP using the command below.

### Read demo SMS and OTP codes

First request an OTP through the app, then run this from `backend`:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml exec -T backend python manage.py demo_sms
```

Expected output: the last captured messages, each in this shape:

```text
<timestamp> | <phone> | <template-id> | <JSON parameters containing the generated code/message>
```

An empty inbox prints nothing. Use the code actually generated for your request;
there is no fixed OTP. Codes still expire and have attempt limits. Messages are
captured locally, not sent to the example phone numbers. The demo does not need
SMS.ir credentials. Do not copy its OTP inbox or sample data into production.

The demo scanner exercises upload/integrity states; it is not production ClamAV
malware detection. No payment functionality is simulated. For the complete
presentation walkthrough, see [demo.md](backend/docs/demo.md).

## 10. Stop, restart, update, or reset

Run these commands from `D:\GitHub\dentotime\backend` with Docker Desktop running.

### Stop without deleting data

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml stop
```

Expected output: the running demo services report `Stopped`. Database and file
volumes remain. The unrelated `dentotime-review` project is not stopped.

### Start again after stopping or restarting Windows

Open Docker Desktop and wait for its engine, then run:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml up -d --no-build --wait --wait-timeout 180
```

Expected output: services return to `Started`/`Healthy`, and one-time setup exits
successfully. Your existing presentation data remains. Do not assume the demo
automatically starts just because Docker Desktop started.

### Update the checkout and rebuild

Check your current branch and local changes first:

```powershell
git status --short
git branch --show-current
```

Expected output for a clean checkout: no status entries, followed by the current
branch name. If files are listed, preserve your work before pulling; do not use a
hard reset or delete the checkout.

With a clean checkout and the intended branch selected:

```powershell
git pull --ff-only
```

Expected output: `Already up to date.` or a fast-forward update summary. Stop if
Git reports divergence, conflicts, or an authentication error.

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml build backend frontend
if ($LASTEXITCODE -ne 0) { throw 'Build failed; existing data has not been reset.' }
docker compose -p dentotime-demo -f docker-compose.demo.yml up -d --no-build --wait --wait-timeout 180
```

Expected output: new images build, changed services are recreated, and services
become healthy. Additive migrations run through setup; demo seeding preserves
the existing baseline and subsequent changes. Repeat the health checks in step 7.

### Optional one-command startup script

Instead of the explicit build/start commands, this repository provides:

```powershell
.\scripts\Start-Demo.ps1
```

Expected output: build/start progress, a service-status table, and:

```text
Demo: http://localhost:3100/login | Password: DentoDemo2026!
Accounts and scenarios: D:\GitHub\dentotime\backend\docs\demo.md
```

If Windows blocks local PowerShell scripts, either keep using the explicit Docker
commands above or, after reviewing the script, allow local scripts **for this
PowerShell session only**:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Expected result: an optional confirmation prompt, then no output. This does not
change the computer-wide execution policy; organizational policy can still block
scripts. Do not weaken machine-wide policy to run the demo.

### Optional destructive reset before a new presentation

The initial baseline includes available slots for **14 days**. Restarting does
not refresh old dates. If the baseline is old, you can add fresh availability
through the doctor UI without deleting data.

**Only if all existing demo data is disposable**, use the following reset. It
deletes the dedicated demo database and uploaded files, including presentation
changes and changed passwords. Back up anything you need first. This is **not**
an upgrade command and is not required to start a new build.

```powershell
.\scripts\Start-Demo.ps1 -Reset
```

Expected output begins with:

```text
Resetting only dentotime-demo: its sample accounts, uploads and presentation changes will be deleted.
```

Then demo containers/volumes are removed, recreated, and initialized. The accounts
table returns to its original passwords/states and dates are refreshed. The
script has no additional interactive confirmation. It explicitly targets only
`dentotime-demo`, not the review installation.

Do not use broad volume pruning, Docker factory reset, or volume-deleting Compose
commands as routine fixes. Database credentials live in an existing PostgreSQL
volume; changing an environment variable does not reset its users or passwords.

## 11. Troubleshooting and tests

### WSL download stalls or Microsoft Store access is unavailable

For a failed Ubuntu install, from Administrator PowerShell:

```powershell
wsl.exe --install --web-download -d Ubuntu --no-launch
```

Expected output: Ubuntu downloads through the web source and installs. If WSL
itself needs updating through that source:

```powershell
wsl.exe --update --web-download
```

Expected output: a successful WSL update or an already-current message. Restart
when requested. For virtualization errors, enable virtualization in BIOS/UEFI and
check [Microsoft's WSL troubleshooting](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting).
Do not unregister a distribution to repair an installation containing data.

### Docker cannot connect or is using the wrong engine

Open Docker Desktop, wait for the Linux engine, then inspect available contexts:

```powershell
docker context ls
```

Expected output: a context table. A typical Desktop install includes
`desktop-linux`; an asterisk marks the active context. If you accidentally selected
a remote/other engine, and `desktop-linux` is listed, switch deliberately:

```powershell
docker context use desktop-linux
```

Expected output confirms `desktop-linux` is the current context. This changes
where subsequent Docker commands run. Recheck the two `linux` outputs in step 4.
If the context is absent, finish Docker Desktop setup instead of inventing one.

### Docker reports `read-only file system` or `input/output error`

**Stop rebuilding.** Check Windows free space with the step 1 command. Docker's
Linux disk may report free capacity even while the host drive holding its virtual
disk is full. Free enough host space, then restart Docker Desktop and check the
demo status before retrying. Do not delete database volumes or factory-reset Docker.

For a supported data-location change, use **Docker Desktop → Settings → Resources
→ Advanced → Disk image location**, where available in your installation. Choose
a drive with adequate space; do not manually move/delete a live WSL disk. See
[Docker Desktop storage settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/).

This read-only diagnostic shows Docker's storage categories:

```powershell
docker system df
```

Expected output: a table of images, containers, local volumes, and build cache
sizes. “Reclaimable” does not mean the data is safe to delete.

### A port is already allocated

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3100, 18000, 19000, 19001) } | Select-Object LocalAddress, LocalPort, OwningProcess
```

Expected output: no rows when those ports are unused, or the listeners currently
holding them. The running demo itself will appear here. Identify the owner before
stopping anything; do not kill unrelated processes. The separate review site on
port 3000 can coexist with the demo.

### Setup timed out, a container is unhealthy, or a download failed

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml logs --tail 100 demo-setup backend frontend file-scanner
```

Expected output: recent logs for the selected services. Find the first concrete
error—database, storage, DNS, package download, or application startup—and fix it.
If healthy initialization simply exceeded the wait time, rerun step 7 with a longer
wait timeout. Do not reset data merely because a startup wait timed out.

Network access is needed for Docker images, npm, and the Python mirror. Configure
approved proxy/network settings when needed; do not disable TLS/hash verification.

### “Invalid credentials” during a demo

1. Confirm the browser URL is `http://localhost:3100/login` or its admin login,
   not the review installation at port 3000.
2. Choose the correct patient/doctor login tab and copy the full password,
   including `!`; preserve the phone number's leading zero.
3. The two inactive accounts intentionally cannot log in. The guest identity has
   no password. Pending/rejected verification alone does not disable doctor login.
4. A password changed during a presentation stays changed after restart. Use the
   app's password recovery and captured demo OTP, or reset only disposable demo data.
5. Log out before switching roles, or use separate browser profiles. Repeated
   rapid attempts may be rate-limited; wait for the indicated retry period.
6. Inspect the setup logs above: first setup must finish successfully before the
   baseline accounts exist. Never fix login by deleting production/review volumes.

### Run the automated backend/demo tests (optional)

With demo infrastructure running, from `backend`:

```powershell
docker compose -p dentotime-demo -f docker-compose.demo.yml --profile tests run --rm tests
```

Expected successful output, abbreviated:

```text
... installing test-only dependencies from the Python mirror ...
... [100%]
<scenario-test-count> passed in <duration>
... [100%]
<backend-test-count> passed in <duration>
```

Counts vary by checkout. Success means both suites finish with no failures/errors
and the command exits with code 0; a partial run is not a pass. Tests use a separate
`test_dentotime_demo` database, mocked S3, and an isolated test cache. The disposable
test container does not reset your running presentation data. Allow additional
disk space and download time for these dependencies.

Browser regression instructions and their local tooling prerequisites are
separate from Docker startup: see [demo verification](backend/docs/demo.md#verification)
and [doctor-profile/booking checks](backend/docs/doctor-profile-booking.md#verification).

## 12. Non-demo and production deployments

**This demo is local-only.** Its public sample credentials, captured SMS, synthetic
documents, and local scanner must not be exposed on the internet or used with real
patient data. Published ports bind to loopback. Never promote its database/files to
production or point demo settings at a production database.

The demo uses `docker-compose.demo.yml` with Compose project `dentotime-demo`.
The ordinary HTTP review stack uses `docker-compose.http.yml`, `.env.server`, and
separate `dentotime-review` resources; normal migrations do not install these demo
login accounts. Do not switch Compose files midway through these instructions.

For a non-demo installation, environment configuration, production secrets, TLS,
private storage, real malware scanning, backups, and the existing-data release
gate, use these guides. Do not copy checked-in example credentials into production.

- [Local development and server deployment](backend/docs/LOCAL_AND_SERVER_DEPLOYMENT.md)
- [راهنمای راه‌اندازی روی سرور — Persian deployment guide](docs/server-deployment-fa.md)
- [Isolated demo architecture and presentation scenarios](backend/docs/demo.md)
- [Doctor profile and insurance-first booking contract](backend/docs/doctor-profile-booking.md)
