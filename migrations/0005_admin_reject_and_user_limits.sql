-- An admin may reject a user's file while it waits for the user's Confirm Payment (D-32). Kept apart from
-- CANCELLED (the user's own decision) so the two read differently; cancelled_* records who and why for both.
ALTER TABLE payout_files
  MODIFY status ENUM('AWAITING_APPROVAL','ACCEPTED','PROCESSING','COMPLETED','COMPLETED_WITH_FAILURES','FAILED','CANCELLED','REJECTED')
  NOT NULL DEFAULT 'AWAITING_APPROVAL';

-- Per-user limits (D-33): an admin can give one user different settings for a global limit rule. Locked and
-- custom rules can't be overridden; whether a rule is on stays global.
CREATE TABLE user_rule_overrides (
  id          CHAR(36)    NOT NULL,
  user_id     CHAR(36)    NOT NULL,
  rule_id     CHAR(36)    NOT NULL,
  params_json JSON        NOT NULL,
  created_by  CHAR(36)    NOT NULL,
  updated_by  CHAR(36)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_rule_overrides (user_id, rule_id),
  CONSTRAINT fk_user_rule_overrides_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_user_rule_overrides_rule FOREIGN KEY (rule_id) REFERENCES upload_rules (id),
  CONSTRAINT fk_user_rule_overrides_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_user_rule_overrides_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);

-- Override changes are audited with the rule changes, naming the user they apply to.
ALTER TABLE upload_rule_changes
  MODIFY action ENUM('created','updated','enabled','disabled','deleted','override_set','override_cleared') NOT NULL,
  ADD COLUMN target_user_id CHAR(36) NULL AFTER changed_by,
  ADD CONSTRAINT fk_upload_rule_changes_target FOREIGN KEY (target_user_id) REFERENCES users (id);
