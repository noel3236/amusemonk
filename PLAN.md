# amusemonk — File → UAPI payout bridge (Next.js on AWS)

Port of `file-to-api-payout` (Express + EJS + Postgres) to Next.js, deployed at **amusemonk.com**.

## Decisions (2026-10-29)

| Concern | Decision |
|---|---|
| App | Next.js 16 App Router, RSC-first, TypeScript strict, pnpm |
| Auth | NextAuth Credentials → sandbox gatekeeper `POST /api/v3/gatekeeper/identity/sessions` (email + password + OTP), same pattern as cekko. Gatekeeper session cookie + CSRF are encrypted inside the JWT and never reach the browser |
| Payout calls | **UAPI only** (`/uapi/v1/peatio/account/…`: balances, payouts/initiate, payouts/status), HMAC-signed with the **logged-in user's own** API key |
| Per-user UAPI key | Users generate their key on the main platform (any IP, `*`) and paste key + secret after login; verified with a balance call, then stored encrypted (D-34) |
| Egress | **Every outbound call goes through the VPN**: gluetun (Proton OpenVPN, `credentials/darwin.env`) exposes an HTTP proxy on :8888, and `src/lib/egress.ts` `outboundFetch` is the only allowed way out (ESLint bans bare `fetch`) |
| Idempotency key | `client_reference_id` column of the uploaded file, sent as-is. Never derived, no `-R2` retry suffix |
| Gateway settings | None. That's backend work |
| DB | AWS RDS MySQL 8 (`FOR UPDATE SKIP LOCKED` is supported) via Kysely (typed SQL, explicit locking) + SQL migrations |
| Files | S3: raw uploads + generated status exports (presigned downloads) |
| Hosting | One EC2 instance running Docker Compose: `web` (Next.js), `worker` (dispatch / poll / reconcile), Caddy (TLS for amusemonk.com) |
| Upload rules | Stored in DB, toggleable / tunable / addable from a Rules screen. Money-safety rules (duplicate `client_reference_id` in-file and cross-file, payment fingerprint) are **locked on** and backed by unique keys |
| User flow | Upload → review rows → **Confirm Payment** → come back for file and payout status; the worker sends, polls and reconciles in the background |
| Admin | `/admin` for gatekeeper `super_admin` only, no part in payments: all users' files (reject before confirmation), users (amusemonk only: key status, revoke, per-user limits), upload rules (global) |
| UI | Own design system and theme. Corona is the structural reference for tables, filters and shell, but palette, naming, layout details and copy are new, so the two products aren't recognisably the same |

## Consequence to accept
With the reference taken verbatim from the file, a payout that fails on *insufficient balance* has burned its
`client_reference_id` at the gateway, so it can't be retried in-app. The fix is a new file with new ids.

## Steps
1. **Foundations**: git init (noel identity), project memory, `CONTEXT.md` carried over and updated to these decisions
2. **Scaffold**: Next.js + Tailwind 4 + Radix design system, own theme, app shell, login page
3. **Auth**: gatekeeper login (OTP), session, logout, route guard
4. **DB**: MySQL schema + migrations (users, files, payouts, attempts, upload_attempts, rules, webhook_events, user_api_keys)
5. **UAPI key onboarding**: OTP → create key → encrypted storage; HMAC client for balance / initiate / status
6. **Ingest + rules engine**: parse CSV/XLSX, configurable rules, all-or-nothing accept, S3 storage
7. **Workers**: dispatcher / poller / reconciler ported to MySQL, per-user keys, circuit breaker
8. **Screens**: file detail (review rows + Confirm Payment), files list, payouts list, status downloads, full dashboard. Admin files / users / rules are done
9. **Tests**: port the 96-test suite to MySQL
10. **AWS**: S3 bucket, RDS MySQL, EC2 + Elastic IP + IAM role, Docker deploy, DNS → amusemonk.com, TLS
