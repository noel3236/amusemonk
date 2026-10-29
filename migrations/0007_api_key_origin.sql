-- `generated` keys were created on the gateway by amusemonk, so revoking one also deletes it there; a `pasted` key may
-- serve the user's other integrations and is only disconnected.
ALTER TABLE user_api_keys ADD COLUMN origin ENUM('pasted','generated') NOT NULL DEFAULT 'pasted' AFTER scope;
