# Messaging retention and deletion

- Thread deletion is a reversible logical archive. The thread receives `deleted_at`,
  `deleted_by`, and `ARCHIVED`; its messages, attachment rows, and file assets remain
  linked for audit and retention processing.
- Deleted threads are excluded from participant and administrator inbox queries and
  cannot accept new messages. Repeated deletion is idempotent.
- Messages use `is_deleted`, `deleted_at`, and `deleted_by` for any future moderation
  workflow. Application code must not physically delete a message or attachment.
- An attached `FileAsset` remains protected by its attachment and thread scope. File
  retention jobs may remove object bytes only after the configured retention deadline;
  they retain the asset and access-audit metadata required to explain the deletion.
- Administrator-only notes are separate message records with `ADMINS_ONLY` visibility.
  Participant queries and previews always filter these records at the database layer.
- Guest contact fields are snapshots on a guest thread. They never create, update, or
  authenticate an account.
