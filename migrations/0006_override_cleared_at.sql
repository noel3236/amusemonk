-- Clearing a per-user limit keeps the row (nothing is hard-deleted); setting it again reuses it.
ALTER TABLE user_rule_overrides ADD COLUMN cleared_at DATETIME(3) NULL AFTER params_json;
