# Credential rotation procedure

Repository changes can remove exposed values and make rotation possible, but
rotation is complete only after the corresponding provider-side operation has
been performed and verified.

## Immediate rotation

1. Generate a new Django `SECRET_KEY` and a separate `JWT_SIGNING_KEY` with a
   cryptographically secure password generator.
2. Change the PostgreSQL password at the database provider, update the deployed
   `DB_PASS`, restart the application, and verify that the old password fails.
3. Revoke and recreate the SMS.ir API key. Update `SMS_IR_API_KEY` and verify
   that the revoked key fails without sending a real SMS.
4. Revoke and recreate object-storage credentials with the minimum bucket
   permissions. Update the `AWS_*` variables and verify that the old key fails.
5. Deploy the new `JWT_SIGNING_KEY`. This invalidates every existing access and
   refresh token; all users must authenticate again.
6. Disable or reset all known accounts created by historical seed migrations.
7. Search application, proxy, CI, and deployment logs for exposed credentials
   and remove affected retained artifacts according to the incident policy.

## Verification record

Record only the rotation time, operator, provider credential identifier, and
verification result. Never record secret values in tickets, commits, or logs.

## Git history

The current source no longer tracks local databases or uploaded media. If this
repository has been shared, coordinate a history rewrite separately after all
credentials have been rotated. History rewriting changes commit identities and
must be coordinated with every repository consumer; rotation must not wait for
that rewrite.
