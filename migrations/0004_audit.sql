-- Every upload, accepted or rejected. Rejected uploads consume nothing: no payouts, no references.
CREATE TABLE upload_attempts (
  id                CHAR(36)     NOT NULL,
  user_id           CHAR(36)     NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  raw_sha256        CHAR(64)     NULL,
  size_bytes        INT          NULL,
  s3_key            VARCHAR(512) NULL,
  outcome           ENUM('ACCEPTED','REJECTED') NOT NULL,
  file_id           CHAR(36)     NULL,
  errors_json       JSON         NOT NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_upload_attempts_user (user_id, created_at),
  CONSTRAINT fk_upload_attempts_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_upload_attempts_file FOREIGN KEY (file_id) REFERENCES payout_files (id)
);

-- Gateway callbacks are triggers, not truth: they only make the poller re-fetch status sooner.
CREATE TABLE webhook_events (
  id                  CHAR(36)    NOT NULL,
  received_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  signature_valid     BOOLEAN     NOT NULL,
  client_reference_id VARCHAR(64) NULL,
  gateway_payout_id   VARCHAR(64) NULL,
  payload_json        JSON        NULL,
  raw_body            MEDIUMTEXT  NULL,
  processed_at        DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_webhook_events_reference (client_reference_id)
);
