-- A warning, not a rejection (D-44): a file whose payout count and total match recent files of the same user is
-- accepted, flagged on its review page, and Confirm Payment then needs an explicit "not a repeat".
INSERT INTO upload_rules (id, rule_key, kind, name, description, enabled, locked, params_json, sort_order) VALUES
  (UUID(), 'similar_files', 'similar_files', 'Look-alike files',
   'Warn when a file has the same number of payouts and the same total as another of the user''s files from the last N days (cancelled and rejected ones skipped). The file is still accepted; Confirm Payment then asks the user to confirm it is not a repeat.',
   TRUE, FALSE, JSON_OBJECT('window_days', 30), 145);
