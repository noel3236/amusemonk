-- Duplicate files (name / bytes / canonical content) are switchable rules, so they are indexed, not unique.
-- The guarantee against paying twice is uq_payouts_reference + uq_payouts_fingerprint below: a repeated
-- file carries the same references and fails inside the same insert transaction.
CREATE TABLE payout_files (
  id                  CHAR(36)     NOT NULL,
  user_id             CHAR(36)     NOT NULL,
  original_filename   VARCHAR(255) NOT NULL,
  normalized_filename VARCHAR(255) NOT NULL,
  raw_sha256          CHAR(64)     NOT NULL,
  canonical_sha256    CHAR(64)     NOT NULL,
  s3_key              VARCHAR(512) NOT NULL,
  size_bytes          INT          NOT NULL,
  row_count           INT          NOT NULL,
  total_amount_paise  BIGINT       NOT NULL,
  status              ENUM('AWAITING_APPROVAL','ACCEPTED','PROCESSING','COMPLETED','COMPLETED_WITH_FAILURES','FAILED','CANCELLED')
                      NOT NULL DEFAULT 'AWAITING_APPROVAL',
  warnings_json       JSON         NOT NULL,
  rules_snapshot_json JSON         NOT NULL,
  accepted_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  approved_at         DATETIME(3)  NULL,
  approved_by         CHAR(36)     NULL,
  cancelled_at        DATETIME(3)  NULL,
  cancelled_by        CHAR(36)     NULL,
  cancel_reason       VARCHAR(500) NULL,
  completed_at        DATETIME(3)  NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_payout_files_user_created (user_id, created_at),
  KEY ix_payout_files_status (status),
  KEY ix_payout_files_normalized_filename (normalized_filename),
  KEY ix_payout_files_raw_sha256 (raw_sha256),
  KEY ix_payout_files_canonical_sha256 (canonical_sha256),
  CONSTRAINT ck_payout_files_rows CHECK (row_count > 0),
  CONSTRAINT ck_payout_files_total CHECK (total_amount_paise > 0),
  CONSTRAINT fk_payout_files_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_payout_files_approved_by FOREIGN KEY (approved_by) REFERENCES users (id),
  CONSTRAINT fk_payout_files_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id)
);

CREATE TABLE payouts (
  id                     CHAR(36)     NOT NULL,
  file_id                CHAR(36)     NOT NULL,
  user_id                CHAR(36)     NOT NULL,
  file_row               INT          NOT NULL,
  -- THE idempotency key, sent to the gateway verbatim. The case-insensitive collation makes "ABC" and
  -- "abc" collide, which is stricter than the gateway and therefore safe.
  client_reference_id    VARCHAR(64)  NOT NULL,
  content_fingerprint    CHAR(64)     NOT NULL,
  bank_account           VARCHAR(18)  NOT NULL,
  ifsc_code              CHAR(11)     NOT NULL,
  beneficiary_name       VARCHAR(100) NOT NULL,
  amount_paise           BIGINT       NOT NULL,
  transaction_date       DATE         NOT NULL,
  status                 ENUM('PENDING','DISPATCHING','PROCESSING','UNKNOWN','SUCCEEDED','FAILED','REFUNDED','CANCELLED')
                         NOT NULL DEFAULT 'PENDING',
  failure_reason         VARCHAR(255) NULL,
  attempt_count          INT          NOT NULL DEFAULT 0,
  current_attempt_id     CHAR(36)     NULL,
  api_key_id             CHAR(36)     NULL,
  gateway_payout_id      VARCHAR(64)  NULL,
  bank_transaction_id    VARCHAR(64)  NULL,
  gateway_status         VARCHAR(32)  NULL,
  gateway_status_code    VARCHAR(32)  NULL,
  gateway_status_message VARCHAR(500) NULL,
  last_polled_at         DATETIME(3)  NULL,
  next_poll_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  poll_failures          INT          NOT NULL DEFAULT 0,
  locked_at              DATETIME(3)  NULL,
  locked_by              VARCHAR(128) NULL,
  completed_at           DATETIME(3)  NULL,
  created_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payouts_reference (client_reference_id),
  UNIQUE KEY uq_payouts_fingerprint (content_fingerprint),
  UNIQUE KEY uq_payouts_file_row (file_id, file_row),
  UNIQUE KEY uq_payouts_gateway_payout_id (gateway_payout_id),
  KEY ix_payouts_status_poll (status, next_poll_at),
  KEY ix_payouts_status_locked (status, locked_at),
  KEY ix_payouts_user_created (user_id, created_at),
  KEY ix_payouts_updated (updated_at),
  CONSTRAINT ck_payouts_row CHECK (file_row > 0),
  CONSTRAINT ck_payouts_amount CHECK (amount_paise > 0),
  CONSTRAINT fk_payouts_file FOREIGN KEY (file_id) REFERENCES payout_files (id),
  CONSTRAINT fk_payouts_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_payouts_api_key FOREIGN KEY (api_key_id) REFERENCES user_api_keys (id)
);

-- Every dispatch / adopt / reconcile call to the gateway. All attempts of a payout reuse its reference.
CREATE TABLE payout_attempts (
  id                  CHAR(36)     NOT NULL,
  payout_id           CHAR(36)     NOT NULL,
  attempt_no          INT          NOT NULL,
  client_reference_id VARCHAR(64)  NOT NULL,
  api_key_id          CHAR(36)     NOT NULL,
  gateway_endpoint    VARCHAR(255) NOT NULL,
  request_json        JSON         NULL,
  response_json       JSON         NULL,
  http_status         INT          NULL,
  outcome             ENUM('STARTED','ADOPTED_EXISTING','CREATED','FAILED','UNKNOWN','DEFERRED') NOT NULL DEFAULT 'STARTED',
  error_code          VARCHAR(128) NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at         DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_attempts_payout_no (payout_id, attempt_no),
  KEY ix_payout_attempts_reference (client_reference_id),
  CONSTRAINT ck_payout_attempts_no CHECK (attempt_no >= 1),
  CONSTRAINT fk_payout_attempts_payout FOREIGN KEY (payout_id) REFERENCES payouts (id),
  CONSTRAINT fk_payout_attempts_api_key FOREIGN KEY (api_key_id) REFERENCES user_api_keys (id)
);

ALTER TABLE payouts
  ADD CONSTRAINT fk_payouts_current_attempt FOREIGN KEY (current_attempt_id) REFERENCES payout_attempts (id);
