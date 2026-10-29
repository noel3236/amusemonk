-- The gateway's last status response for each payout, verbatim, so users can see exactly what UAPI said.
ALTER TABLE payouts ADD COLUMN gateway_response_json JSON NULL AFTER gateway_status_message;
