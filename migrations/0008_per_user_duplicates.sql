-- D-41: references, payments and files are unique per user, since each user pays from their own gateway account.
-- Index swaps only; no rows change.
ALTER TABLE payouts
  DROP INDEX uq_payouts_reference,
  DROP INDEX uq_payouts_fingerprint,
  ADD UNIQUE KEY uq_payouts_user_reference (user_id, client_reference_id),
  ADD UNIQUE KEY uq_payouts_user_fingerprint (user_id, content_fingerprint);

ALTER TABLE payout_files
  DROP INDEX ix_payout_files_normalized_filename,
  DROP INDEX ix_payout_files_raw_sha256,
  DROP INDEX ix_payout_files_canonical_sha256,
  ADD KEY ix_payout_files_user_filename (user_id, normalized_filename),
  ADD KEY ix_payout_files_user_raw_sha256 (user_id, raw_sha256),
  ADD KEY ix_payout_files_user_canonical_sha256 (user_id, canonical_sha256);
