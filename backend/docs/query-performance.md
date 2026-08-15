# Query and payload release budgets

Run all measurements against PostgreSQL with representative, anonymized staging data.
SQLite results are not accepted for query counts, locking, constraints, or plans.

## Automated budgets

- Appointment list: at most 2 queries for either 1 or 100 returned rows.
- Message history: at most 3 queries for either 1 or 100 returned rows.
- Review list: at most 3 queries for either 1 or 100 returned rows.
- Public doctor list: at most 2 queries for either 1 or 100 returned rows.
- Thread list: at most 2 queries for either 1 or 100 returned rows.
- Each bounded 100-row list response: at most 256 KiB.

The test suite runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and verifies that
the critical slot, message, and participant-thread query shapes can use their
targeted composite indexes. The test disables sequential scans only to prove
index eligibility on the deliberately small test fixture.

## Staging plan review

Before a release that changes query shapes or indexes, capture plans without
disabling sequential scans on production-scale staging data:

```powershell
python manage.py test tests.test_query_efficiency
python manage.py shell -c "from appointments.models import AppointmentSlot; print(AppointmentSlot.objects.filter(status='AVAILABLE').order_by('start_at').explain(analyze=True, buffers=True, format='text'))"
```

Store the reviewed plans as CI artifacts. Reject plans that unexpectedly scan
large tables, spill sorts to disk, or materially regress total execution time or
buffer reads against the last accepted baseline.
