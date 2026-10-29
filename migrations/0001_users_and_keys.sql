-- Identity and roles live in gatekeeper (admin = gatekeeper super_admin); this is the local mirror that owns
-- files and API keys.
-- MySQL commits every DDL statement on its own (no transactional DDL), so keep each file small.

CREATE TABLE users (
  id              CHAR(36)     NOT NULL,
  gatekeeper_uid  VARCHAR(64)  NOT NULL,
  email           VARCHAR(255) NULL,
  gatekeeper_role VARCHAR(64)  NOT NULL DEFAULT '',
  last_login_at   DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_gatekeeper_uid (gatekeeper_uid)
);

-- The UAPI key each user's payouts are signed with. Gatekeeper shows a secret only once, at creation.
CREATE TABLE user_api_keys (
  id             CHAR(36)     NOT NULL,
  user_id        CHAR(36)     NOT NULL,
  kid            VARCHAR(64)  NOT NULL,
  secret_enc     TEXT         NOT NULL,
  scope          VARCHAR(255) NULL,
  status         ENUM('active','revoked') NOT NULL DEFAULT 'active',
  -- NULL for revoked keys, so the unique key allows any number of those but one active key per user.
  active_user_id CHAR(36) GENERATED ALWAYS AS (IF(status = 'active', user_id, NULL)) STORED,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at     DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_api_keys_kid (kid),
  UNIQUE KEY uq_user_api_keys_one_active (active_user_id),
  KEY ix_user_api_keys_user (user_id),
  CONSTRAINT fk_user_api_keys_user FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Last balance fetched with each user's key. Refreshed around dispatches, never on every page view.
CREATE TABLE user_balances (
  user_id       CHAR(36)    NOT NULL,
  balance_paise BIGINT      NULL,
  locked_paise  BIGINT      NULL,
  fetched_at    DATETIME(3) NULL,
  error         VARCHAR(500) NULL,
  error_at      DATETIME(3) NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_balances_user FOREIGN KEY (user_id) REFERENCES users (id)
);
