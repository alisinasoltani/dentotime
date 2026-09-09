# Rating demonstration accounts

`seed_rating_demo` is retired and always exits without changing data. Do not run
it against `docker-compose.http.yml` or try to reactivate it with environment
flags. The previous `DemoRating123!` credentials are not the current demo accounts.

Use the isolated scenario demo in [demo.md](demo.md), which includes separate
instructions for **Ubuntu/Bash** and **Windows/PowerShell**, remote SSH access,
and optional resets. Its `demo-setup` service creates the scenarios automatically.

## Test the rating flow

All accounts below start with password **`DentoDemo2026!`**:

| Scenario | Phone | Expected result |
|---|---|---|
| Eligible patient | `09120001103` | Completed attended visit; can submit a first rating |
| Blocked patient | `09120001104` | Future appointment; cannot rate until an attended visit |
| Existing rating | `09120001106` | Can edit the existing seven-part rating and comment |
| Approved doctor | `09120001201` | Can view ratings for the primary demo doctor |

Open <http://localhost:3100/doctors/demo-doctor-approved> on the machine running
the demo, or on your own computer with the SSH tunnel from the demo guide open.
Use separate browser profiles when showing multiple roles simultaneously.

See [the full account table and presentation route](demo.md#accounts) for all
roles, account states and scenarios. Keep demo data and credentials out of
production.
