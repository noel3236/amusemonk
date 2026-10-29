# CONTEXT.md — amusemonk (File → UAPI payout bridge)

> **This file is the single source of truth for design decisions.** Read it before changing
> anything. Update it whenever a decision changes. If code and this file disagree, the code is wrong.

Last updated: 2026-10-29 — ported from `file-to-api-payout`. Sections not yet re-verified against the port are marked **(legacy)**.

---

## 1. What this system is

A bridge that accepts a **file of payout orders** (CSV / XLSX), validates it as a whole,
and — only if the **entire file** passes — converts every row into an individual payout call to
the external **payment gateway** (HMAC-signed REST API, see `docs/API-Integration-Guide.pdf`).
It then keeps fetching each payout's status from the gateway, and lets the user see file-level
status, dashboard totals, and download the file with the latest per-row status.

**This is a money-moving system. A duplicate payout is a direct financial loss.**
Every design choice below optimises for *never paying twice*, then for *never losing track of a
payment*, then for everything else.

## 2. Stack (decided 2026-10-29)

| Concern | Choice | Why |
|---|---|---|
| App | Next.js 16 App Router (RSC-first) + TypeScript strict, pnpm | One codebase for UI and server actions |
| Worker | Separate Node process from the same image (`worker` service) | Dispatch / poll / reconcile must run continuously |
| Auth | NextAuth Credentials → sandbox gatekeeper `POST /api/v3/gatekeeper/identity/sessions` (email + password + OTP). Gatekeeper cookie + CSRF live only in the encrypted JWT | Same identity as the gateway account; no local passwords |
| Gateway | **UAPI only** — `/uapi/v1/peatio/account/{balances/inr,payouts/initiate,payouts/status}`, HMAC-signed with the **uploading user's own** API key | Payouts come from the user's own gateway account |
| DB | **AWS RDS MySQL 8** via Kysely + SQL migrations | Unique keys + `FOR UPDATE SKIP LOCKED` (MySQL ≥ 8.0) |
| Files | **S3**: raw uploads + status exports, presigned downloads | Durable, off the web host |
| UI | Own design system (Radix + Tailwind 4 tokens). Corona is a structural reference only and must not be recognisable | Client must not be able to link the two products |
| Egress | **All outbound calls via VPN**: gluetun HTTP proxy (`EGRESS_PROXY_URL`), `src/lib/egress.ts` is the only way out | User rule, 2026-10-29 |
| Deploy | Single EC2 + Docker Compose (`web`, `worker`, Caddy TLS) at amusemonk.com | Cheapest; workers need a long-running host |

Money is stored as `DECIMAL(18,2)` and handled in code as **integer paise** (`bigint`) or decimal
strings — **never** as JS floating point numbers.

## 3. Input file contract

Accepted: `.csv` (UTF-8, optional BOM) and `.xlsx` (first sheet). Header row required.

| Column | Required | Validation |
|---|---|---|
| `client_reference_id` | yes | `^[A-Za-z0-9_-]{8,64}$` (gateway limit). Sent to the gateway **verbatim** as its idempotency key. Unique **forever** across all of that user's files (D-41). |
| `bank_account` | yes | 9–18 digits. Leading zeros preserved (read as text). |
| `ifsc_code` | yes | `^[A-Z]{4}0[A-Z0-9]{6}$` (upper-cased before check) |
| `inr_amount` | yes | Positive decimal, max 2 decimal places, `>= MIN_PAYOUT_INR` and `<= MAX_PAYOUT_INR` |
| `transaction_date` | yes | `YYYY-MM-DD`; not in the future; not older than `MAX_TXN_AGE_DAYS` (default 7) |
| `beneficiary_name` | yes | 2–100 chars, letters/spaces/dots only (gateway **requires** `account_holder_name` — see decision D-1) |

Column order does not matter. Header names are matched case-insensitively after trimming.
**Any extra or missing column rejects the file.** Empty trailing rows are ignored; an empty row in
the middle is a rejection.

A downloadable sample is at `samples/payout_sample.csv` and `GET /samples/payout_sample.csv`.

## 4. File acceptance rules — all-or-nothing, configurable (D-19, D-25)

A file is either **ACCEPTED** (every row stored, waiting for approval) or **REJECTED** (nothing stored except the
upload attempt, its raw file in storage, and the error list). There is no partial accept. Rules live in
`upload_rules` and are edited by super admins at `/admin/rules`; every change is audited in `upload_rule_changes`.
Each accepted file stores the rule set it passed (`rules_snapshot_json`, with `user_override` per rule).
**Per-user limits (D-33):** an admin can override the settings of the six limit rules (`max_file_size`, `max_rows`,
`amount_range`, `file_total_max`, `date_window`, `max_rows_per_account`) for one user in `user_rule_overrides`;
whether a rule is on stays global; locked and custom rules can't be overridden. Clearing sets `cleared_at`.

| Group | Rules | Can admins change it? |
|---|---|---|
| **Always on** (locked) | `columns` (exact header set), `row_format` (gateway formats: reference `^[A-Za-z0-9_-]{8,64}$`, 9–18 digit account, IFSC, positive ≤2-decimal amount, real date, name), `duplicate_reference` (in file and across all the user's files, forever), `duplicate_payment` (same account + IFSC + amount + date, in file and across the user's files) | No. Enforced in code regardless of the DB, plus DB `CHECK`s and unique keys |
| **Configurable** | `max_file_size`, `max_rows`, `duplicate_filename`, `duplicate_file` (bytes), `duplicate_content` (canonical rows), `amount_range`, `file_total_max`, `balance_check`, `date_window`, `max_rows_per_account` | Switch on/off and tune settings |
| **Custom** | `column_pattern` (a column must / must not match a regex), `value_list` (allow-only / block list for a column) | Add, edit, switch, delete (soft) |

Evaluation order: hard 20 MB ceiling (`src/lib/limits.ts`) → `max_file_size` → user must have an active UAPI key →
raw file stored → parse → header → row count → every row (all errors reported at once) → in-file duplicates →
per-account / file-total → **under the global `GET_LOCK('amusemonk_ingest')`**: cross-file duplicates →
`balance_check` (balance − the uploader's in-flight payouts; gateway unreachable ⇒ reject) → one transaction inserts
the file + every payout. A rule whose stored settings don't parse rejects every upload (`RULES_MISCONFIGURED`).

`date_window` uses **today in IST**, not UTC. Error lists are capped at 500 per upload.

## 5. Data model (MySQL 8 — `migrations/`)

```
users               id, gatekeeper_uid UNIQUE, email, gatekeeper_role, last_login_at      (upserted on every login)
user_api_keys       id, user_id, kid UNIQUE, secret_enc, scope, status, revoked_at
                    UNIQUE(active_user_id)  — generated column ⇒ at most one active key per user
user_balances       user_id PK, balance_paise, locked_paise, fetched_at, error
upload_rules        id, rule_key UNIQUE, kind, name, description, enabled, locked, params_json, sort_order,
                    deleted_at   CHECK(NOT locked OR enabled), CHECK(NOT locked OR deleted_at IS NULL)
upload_rule_changes id, rule_id, changed_by, action, before_json, after_json        (audit of every rule edit)
payout_files        id, user_id, original_filename, normalized_filename, raw_sha256, canonical_sha256, s3_key,
                    size_bytes, row_count, total_amount_paise, status, warnings_json, rules_snapshot_json,
                    approved_*, cancelled_*, completed_at     (name/hash columns indexed, NOT unique — D-21)
payouts             id, file_id, user_id, file_row, client_reference_id UNIQUE, content_fingerprint UNIQUE,
                    bank_account, ifsc_code, beneficiary_name, amount_paise, transaction_date, status,
                    failure_reason, attempt_count, current_attempt_id, api_key_id, gateway_payout_id UNIQUE,
                    bank_transaction_id, gateway_status*, last_polled_at, next_poll_at, poll_failures,
                    locked_at, locked_by, completed_at
payout_attempts     id, payout_id, attempt_no, client_reference_id (not unique), api_key_id, gateway_endpoint,
                    request_json, response_json, http_status, outcome, error_code   UNIQUE(payout_id, attempt_no)
upload_attempts     id, user_id, original_filename, raw_sha256, size_bytes, s3_key, outcome, file_id, errors_json
webhook_events      id, received_at, signature_valid, client_reference_id, gateway_payout_id, payload_json, raw_body
```

- Ids are app-generated UUIDs (`CHAR(36)`); MySQL has no `RETURNING`.
- Money is `BIGINT` paise, read as strings (`bigNumberStrings`). `DATETIME(3)` in UTC (session `time_zone` pinned).
- `client_reference_id` uses the default case-insensitive collation: `ABC` and `abc` collide — stricter than the gateway, so safe.
- **No transactional DDL**: a migration that fails halfway is not rolled back. Keep files small; repair by hand.
- `user_rule_overrides` (user_id, rule_id UNIQUE, params_json, cleared_at): per-user limit settings (D-33).
- `payout_files.status` also has `REJECTED` (admin, before confirmation; D-32).
- Every table has `created_at`. Nothing is hard-deleted (custom rules and overrides are soft-deleted).

## 6. Payout state machine

```
PENDING ──claim──▶ DISPATCHING ──201──▶ PROCESSING ──poll──▶ SUCCEEDED
                        │                   │                     │
                        │ 422 permanent     │ poll: rejected      │ poll: refunded
                        ▼                   ▼                     ▼
                     FAILED              FAILED               REFUNDED
                        │
                        │ 500 / timeout / crash
                        ▼
                     UNKNOWN ──reconcile(status API)──▶ PROCESSING | PENDING(if gateway has no record)
```

Terminal: `SUCCEEDED`, `FAILED`, `REFUNDED`, `CANCELLED` (cancelled before approval). Only **terminal** states are final; the UI shows
everything else as "in progress".

### 6.1 Idempotent dispatch — the second line of defence against double payment

`client_reference_id` (the gateway's idempotency key) is **always the file's `client_reference_id` column, verbatim** —
never derived, never suffixed, never random (D-18). One payout = one reference, forever.

Dispatch procedure for one payout (worker):
1. Claim: `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` on `PENDING` payouts of approved files; set `DISPATCHING`, `locked_at`, `locked_by`; insert `payout_attempts`; commit.
2. **Check before create:** `GET /account/payouts/status?client_reference_id=…`. Non-empty → adopt, **do not POST**.
3. Balance check (`GET /account/balances/inr`, uploader's key); short → stay `PENDING`, back off. Reference not consumed.
4. `POST /account/payouts/initiate`:
   - `201` → `PROCESSING` (or terminal), store `payout_id`.
   - `422 duplicate_reference_id` → adopt (step 2).
   - `422 create_in_processing` → `UNKNOWN`, re-check in 10 s.
   - `422 insufficient_balance` → reference consumed → `FAILED`. **No in-app retry** (D-18): re-upload with a new `client_reference_id`.
   - other `422` → `FAILED` (permanent).
   - `401/403` → `UNKNOWN`, circuit opens **for that user's key** only.
   - `500` / timeout / network → `UNKNOWN`. **Never retry the POST blindly.**
   - `503` → stay `DISPATCHING`, sleep, retry step 2.
5. Reconcile (every 60 s): `UNKNOWN` or stuck `DISPATCHING` → step 2. Empty array ⇒ no payout exists ⇒ back to `PENDING`.

Rate limit: gateway allows 20 req/s. Token bucket at `GATEWAY_MAX_RPS` (default 5) per API key.

### 6.2 Status polling
Every `POLL_INTERVAL_SECONDS` (default 30) poll `PROCESSING` payouts by `client_reference_id`,
oldest `last_polled_at` first, with exponential backoff per row up to 10 min. Map
`payout_status`: `succeed→SUCCEEDED`, `rejected→FAILED`, `refunded→REFUNDED`, `processing→PROCESSING`.
Store `status_code`, `status_message`, `bank_transaction_id` (UTR). Terminal rows are never polled again,
except `SUCCEEDED` rows, which are re-polled daily for `REFUND_WATCH_DAYS` (3) because a succeed can
still become refunded.

### 6.3 Webhooks
`POST /webhooks/gateway/payout`: verify `X-Signature` = HMAC-SHA256(secret, **raw body**) with timing-safe
compare; store event; look up the payout by `client_reference_id`; set `next_poll_at = now()` so the
poller fetches the truth from the status API. **The webhook payload itself never changes a payout
status** (guide: "callbacks are triggers, not truth"). Always answer 200 quickly.

## 6.4 Confirm Payment (D-29)
An accepted upload lands in **`AWAITING_APPROVAL`**. The dispatcher's claim only takes payouts whose file has
`approved_at IS NOT NULL` and isn't `CANCELLED`, so nothing reaches the gateway without approval.
- User flow: upload → review the rows → **Confirm Payment** (one step; stored as `approved_at`) → come back later for
  file and payout status. The worker is the background job that sends, polls and reconciles.
- **Only the uploader confirms or cancels their own file**: the money comes from their own gateway account.
- An admin may **reject** a file only while it waits for confirmation (D-32): status `REJECTED`, payouts
  `CANCELLED`, reason shown to the user, references stay consumed.
- Approval is atomic (`FOR UPDATE` on the file), only from `AWAITING_APPROVAL`, and re-checks the balance: the
  uploader's balance − their approved in-flight payouts must cover the file total; an unreadable balance refuses.
- Cancel is allowed only before approval; payouts become `CANCELLED`; references stay consumed (D-15).

## 6.5 Worker (`src/worker/`, `pnpm worker`)
Separate long-running process; any number can run. Dispatch every 5 s (batch 10), poll every 30 s, reconcile every
60 s. Each payout is signed with its uploader's active key; a user without one is skipped (PENDING, 5 min backoff),
never failed. A 401/403 opens a 5-minute circuit **for that user only**. Within a batch, what was already sent is
subtracted from the balance, because the gateway's balance can lag our own creates. Attempt rows record real gateway
interactions: an attempt that never reached create (balance wait, failed status check) is reused, not duplicated.

## 7. File status (derived from its payouts)

| File status | Condition |
|---|---|
| `AWAITING_APPROVAL` | validated and stored; **nothing sent**; waiting for an approver |
| `CANCELLED` | cancelled before approval; payouts `CANCELLED`; order ids stay consumed |
| `ACCEPTED` | approved, nothing dispatched yet |
| `PROCESSING` | at least one payout non-terminal |
| `COMPLETED` | all payouts `SUCCEEDED` |
| `COMPLETED_WITH_FAILURES` | all terminal, mix of `SUCCEEDED` and `FAILED`/`REFUNDED` |
| `FAILED` | all terminal, none `SUCCEEDED` |

Recomputed by the worker after every payout change; also available live via aggregate query.

## 8. Web UI (desktop-first, compact; no page titles or descriptions — the nav says where you are)

| Route | Who | Purpose |
|---|---|---|
| `/login` | anyone | gatekeeper email + password (+ OTP) |
| `/dashboard` | user | balance (+ API key, Manage → `/profile`), waiting / in progress / paid today, files needing confirmation, recent files. No key yet ⇒ connect-key onboarding (generate, or paste) |
| `/files` | user | upload (sample CSV), **Files** view (Review & Confirm; filters: name, status, dates, amount, row count, only files with failed payouts) and **Rejected uploads** view (error report) |
| `/files/[id]` | owner | rows, filters, tiles; **Confirm Payment** / **Cancel File** while waiting; per-payout fetch status; auto-refresh while paying |
| `/files/[id]/status.csv` · `/original` | owner, super admin | original columns + status, UTR, gateway payout ID, codes, attempts, last update (IST) · the uploaded bytes |
| `/uploads/[id]/errors.csv` | owner, super admin | a rejected upload's problems (row, column, rule, code, problem) |
| `/payouts` | user | every payout: search (reference, account, name, UTR, gateway ID, IFSC, failure reason), status chips, gateway status, file, dates, amount; **Raw** shows the UAPI responses (D-42); 50 per page |
| `/profile` | user | payout API key (generate with a 2FA code, or paste; revoke), two-factor authentication on/off, password change, gateway account (D-40) |
| `/admin/files` (+ `/[id]` read-only) | super admin | all users' files, status filter, **Reject** before confirmation |
| `/admin/users` | super admin | amusemonk users: API key, Revoke, per-user Limits |
| `/admin/rules` | super admin | always-on, configurable and custom upload rules |

CSV cells are guarded against spreadsheet formula injection. Downloads are route handlers and check access themselves.

**Tables** (`src/ui/data/data-table.tsx`, every list): sticky header; columns pin to the left (frozen while the rest
scrolls) and move (drag the grip, or ←/→ on it); pins and order are remembered per table in the browser
(`localStorage`, `amusemonk:pinned:*` / `amusemonk:order:*`); a totals row where the list adds up to money.
References, UTRs and gateway IDs use spark's `Copyable` (ported). **Filters** (`src/ui/filters/list-filters.tsx`,
state in the URL): quick status chips with live counts, "Search by [field]", applied filters as removable chips with
Clear all, and a Filters panel (date field + named ranges in IST, amount range, sort) applied as a draft. Each list's
options live in one `ListSpec` (`features/files/specs.ts`) read by both the query and the controls.

## 9. Configuration

### 9.1 Gateway credentials — per user, pasted by the user (D-34)
No gateway-settings screen (backend's job). The base URL is env (`GATEWAY_BASE_URL`). Each user generates an API key
on the main gateway platform (allowing any IP, `*`, because egress is a rotating VPN exit) and pastes the key and
secret into amusemonk after logging in (Overview → Step 1, later **Replace Key**). Nothing is stored until a signed
balance call through the VPN proves the pair works; then the secret is stored AES-256-GCM encrypted (`SECRETS_KEY`,
key id bound in as associated data) in `user_api_keys`. A key already connected to another amusemonk account is
refused. A payout is always signed with the active key of the user who uploaded its file.

### 9.1.1 Sandbox environment (recorded 2026-10-28)
| Item | Value |
|---|---|
| Portal | https://sandbox.celestiapayment.com/ |
| Access key | not in this file: `credentials/sandbox.md` on the operator's machine (git-ignored) |
| Secret key | **not in this file.** Lives in `credentials/sandbox.md` on the operator's machine (git-ignored) and, once saved, encrypted in `gateway_settings`. |
| API base URL | **Unconfirmed.** The guide says `{BASE_URL}/account/...`; the legacy Ruby adapter used `<endpoint>/uapi/v1/peatio/...`. Use **Test connection** in `/admin/settings`: it probes the URL as typed and with `/uapi/v1/peatio`, `/api/v2/peatio`, `/uapi/v1`, and fills in the one that answers `/public/health`. Record the confirmed value here once known. |
| Webhook secret | Portal → Dashboard → Settings → Security → Webhooks; register `https://<your-app>/webhooks/gateway/payout`. Not recorded yet. |
| Sandbox behaviour | Outcome by first digit of `bank_account`: 0–2 success, 3 processing forever, 4/5/6/9 fail, other → random failure. |

Test files: `npm run samples` writes `test-data/01..04_*.csv` with today's date and fresh order ids
(sample 4 is designed to be rejected). Regenerate after 7 days (date window) or whenever you need new ids.

### 9.2 Balance snapshot
`gateway_balance` (singleton) stores the last balance fetched. It is refreshed: before every dispatch (the
pre-create balance check), after every payout that reaches a terminal state (throttled to once / 3 s), on the
dashboard "↻ Refresh" button, and on first dashboard view. The dashboard tile polls `/api/balance` every 5 s.

### 9.3 Env
See `.env.example`. `AUTH_SECRET`, `SECRETS_KEY`, `DATABASE_URL` come from the platform's secret store, never from
the repo. **Changing or losing `SECRETS_KEY` makes every stored UAPI secret unreadable — users must reconnect.**

## 10. Decisions log

| ID | Date | Decision | Rationale / alternative rejected |
|---|---|---|---|
| D-1 | 2026-10-28 | Added required column `beneficiary_name` to the user's 5 columns | Gateway `POST /account/payouts/initiate` marks `account_holder_name` **required**. A file without it cannot be paid. **Needs user confirmation** — alternative is a per-user default name (rejected: wrong name on bank statements / compliance). |
| D-2 | 2026-10-28 | ~~`client_reference_id` = order id on attempt 1, `-R{n}` after~~ — superseded by D-18 | |
| D-3 | 2026-10-28 | Fingerprint duplicates (D5) **always reject** — no `warn` mode | A `warn` mode was built and removed the same day: it cannot coexist with the hard `UNIQUE(content_fingerprint)` constraint, and the constraint is the whole point. Consequence: two genuinely distinct payments to the same account for the same amount on the same `transaction_date` must be merged into one row (or carry different dates). See open question 5. |
| D-4 | 2026-10-28 | No automatic retry after `insufficient_balance` | The reference is consumed; auto-creating a new reference is exactly how a double pay happens if the first one actually went through. Manual retry re-runs check-before-create first. |
| D-5 | 2026-10-28 | Postgres only, no SQLite in tests | Locking/constraint semantics must be identical in test and prod. |
| D-6 | 2026-10-28 | Worker runs in the same process by default (`RUN_WORKER=true`); can be split into a separate container | One deployable for small scale; horizontal scaling is safe because claiming uses `FOR UPDATE SKIP LOCKED`. |
| D-7 | 2026-10-28 | ~~`client_reference_id` uniqueness is global (across users)~~ Superseded by D-41 | Made sense when every user shared one company gateway account. |
| D-8 | 2026-10-28 | Rejected files consume nothing | A typo'd file must be re-uploadable after fixing. |
| D-9 | 2026-10-28 | Penny-drop: send `penny_drop_required: true` (gateway default) | Safer; cost is latency. Configurable `PENNY_DROP_REQUIRED`. |
| D-10 | 2026-10-28 | "Available balance" = gateway `balance` field as-is (not `balance − locked`) | Matches the user's existing production Ruby adapter (`validate_funds!` compares `balance` directly; peatio holds `locked` separately). If the real gateway turns out to include locked funds inside `balance`, change `availableBalancePaise()` in `src/gateway/client.ts` to subtract `locked`. |
| D-11 | 2026-10-28 | Status-check (`findByClientReference`) 401/403 also trips the circuit breaker | Found by test: without this, a bad credential looked like a transient "status check failed" and rows were deferred forever instead of alerting. |
| D-13 | 2026-10-28 | Gateway credentials live in the DB (admin panel), env is fallback only | Ops can rotate keys / switch sandbox→production without a redeploy; history table gives an audit trail. Encrypted at rest; the API key is also treated as a secret (masked). |
| D-14 | 2026-10-28 | Balance is a stored snapshot refreshed on payout events, not fetched on every dashboard view | Keeps dashboard load off the gateway rate limit while staying fresh within seconds of any payout. |
| D-15 | 2026-10-28 | Cancelled files keep their `client_reference_id`s consumed | Freeing them would let a cancelled batch be re-uploaded byte-for-byte and slip past D2/D3/D4 if someone "fixes" one row; a corrected file must carry new ids, which is also what makes the audit trail unambiguous. |
| D-16 | 2026-10-28 | Approval defaults to `admin_only`, no four-eyes | Matches the current single-operator setup; flip `FOUR_EYES=true` before go-live with more than one operator (recommended). |
| D-17 | 2026-10-29 | Per-user UAPI keys, created by the app, secret encrypted in DB; no gateway-settings UI | User decision: payouts come from each user's own gateway account; gateway config is backend's job. Supersedes D-13. |
| D-18 | 2026-10-29 | Idempotency key = file's `client_reference_id` verbatim; no `-R{n}` retries | User decision. Consequence: an `insufficient_balance` failure can't be retried in-app — the reference is consumed at the gateway. |
| D-19 | 2026-10-29 | Upload rules live in DB, toggle / tune / add from UI; money-safety rules (D4–D7: duplicate reference, duplicate fingerprint) locked on | User decision. Disabling a duplicate check is how a payout goes out twice; unique keys back them regardless. |
| D-20 | 2026-10-29 | RDS MySQL replaces Postgres; S3 for files; single EC2 + Docker on AWS | User decision. |
| D-21 | 2026-10-29 | Duplicate-file checks (D1 name, D2 bytes, D3 content) are switchable rules, so indexed, not UNIQUE | Can't be both toggleable and a DB constraint. Safe: a repeated file carries the same references, and `uq_payouts_reference` rejects it inside the same insert transaction. |
| D-22 | 2026-10-29 | Admin = gatekeeper `super_admin`. One global rule set; only super admins see `/admin` (upload rules, users' API keys, other config) | User decision. No local role column — gatekeeper is the single source of truth. |
| D-23 | 2026-10-29 | ~~Superseded by D-34.~~ Keys are created with `scope: "uapi"` and `whitelisted_ips: ["*"]` | User decision: no IP whitelist (VPN exit rotates). In gatekeeper an EMPTY whitelist means *deny every IP* (`ApiKeyAuthService` passes only `*` or an exact match), so "no whitelist" must be `*`. Scope `uapi` keeps the key off the session APIs (authz sees the path without its leading slash). |
| D-24 | 2026-10-29 | Admin "Revoke" only stops amusemonk using a key; it stays enabled at gatekeeper | Gatekeeper's `PATCH /admin/api_keys/:id` declares `:id` but looks up `declared_params[:kid]` (always nil → 404), so an admin cannot disable it via API. The UI says so. Revisit when atlas is fixed. |
| D-25 | 2026-10-29 | Rules engine: 4 locked rules hard-coded on, 10 tunable, 2 custom templates (pattern, allow/block list) | User asked for rules that can be enabled, disabled or added. Custom regexes are trusted super-admin input (≤200 chars, values ≤100 chars); no RE2. |
| D-26 | 2026-10-29 | One ingest lock (`GET_LOCK`) around cross-file checks, balance check and insert; per user since D-41 | Makes the now non-unique duplicate-file checks and the balance check exact under concurrency. Uploads are rare; the lock waits ≤30 s, then answers BUSY. |
| D-27 | 2026-10-29 | Raw bytes of every upload (accepted or rejected) are stored (S3 in prod, `.storage/` locally) before checks | Audit: an operator can see exactly what was refused and why. Storage failure rejects the upload. |
| D-28 | 2026-10-29 | S3 and RDS are reached directly, not through the VPN | They are our own AWS infrastructure (instance role / VPC), not outside or backend APIs. Confirmed by the user 2026-10-29. |
| D-29 | 2026-10-29 | The uploader approves (and cancels) their own file; no one else can | User decision. Replaces the source's admin-only maker-checker. |
| D-30 | 2026-10-29 | Claim transaction runs at READ COMMITTED and retries a lost deadlock (≤3) | Found by the two-worker test: under REPEATABLE READ the SKIP LOCKED scan takes gap locks on the status index and two claims deadlock when flipping rows to DISPATCHING. |
| D-31 | 2026-10-29 | No webhooks yet; status comes from polling (30 s) | Each user has their own gateway account and webhook secret; polling covers it. Revisit if latency matters. |
| D-32 | 2026-10-29 | Admins can reject a user's file only before the user confirms payment; own status `REJECTED` | User decision. After confirmation payouts may already be at the gateway. |
| D-33 | 2026-10-29 | Limits are global, with per-user overrides set by an admin (six limit rules, settings only) | User decision ("global + per-user override"). |
| D-34 | 2026-10-29 | Users paste their own API key + secret (generated on the main platform); the app verifies it, never creates keys | User decision. Supersedes the OTP key creation of D-17/D-23. Admin panel lists only amusemonk users' keys. |
| D-35 | 2026-10-29 | Prod runs the app as `amusemonk_app` (SELECT, INSERT, UPDATE only); `amusemonk_admin` only runs migrations, and its URL is kept out of the containers' `.env` | The app never deletes rows (soft deletes only), so a compromised or buggy web process can't drop data or change the schema. |
| D-36 | 2026-10-29 | Deploys go through SSM Run Command. Images are tagged by commit and the deploy fails unless the running containers carry that commit's label. SSH (22) is open to the owner IP only, with relay's key (`ec2-user`), for logmania's agent tooling (user, 2026-10-30) | "What is live" is always one exact commit; the only inbound admin surface is the one every other noel box has. |
| D-37 | 2026-10-29 | Production region is `eu-west-2` (London) | User decision. A first build in `ap-south-1` was never asked for; it was torn down the same day. |
| D-38 | 2026-10-29 | `sandbox` and `prod` run side by side on the same box and RDS instance, each with its own gateway, database + DB user, bucket, secrets and hostname; prod only takes images that went to sandbox first | User: test on sandbox and run prod with no data mix-up, without buying more. MySQL grants enforce the database split; separate secrets make sessions and stored keys non-transferable. |
| D-39 | 2026-10-30 | Two prods instead of one: `fintech` (fintech.amusemonk.com) and `galaxy` (galaxy.amusemonk.com), each isolated like D-38; the bare domain serves nothing | User decision. The first single `prod` (database `amusemonk`, user `amusemonk_app`, `/amusemonk/prod/*`) was never used and is idle pending deletion. |
| D-40 | 2026-10-30 | A **Profile** tab, cekko-style: users generate their payout key in amusemonk (needs 2FA; created `scope: uapi`, `whitelisted_ips: ["*"]`, connected at once, secret never shown), turn 2FA on/off and change their gateway password. Pasting a key (D-34) stays as the secondary path. Revoking a generated key deletes it on the gateway; a pasted one is only disconnected (`user_api_keys.origin`) | User decision. Only amusemonk's own key is managed: other gateway keys may run the user's other integrations. A TOTP code is single-use, so replacing a key is revoke, then generate. |
| D-41 | 2026-10-30 | Duplicate checks are per user: reference, payment (fingerprint), file name, bytes and content are compared only with the uploader's own files; unique keys are `(user_id, client_reference_id)` and `(user_id, content_fingerprint)` (migration 0008) | Each user pays from their own gateway account, and sub-users of one gateway merchant can't both use amusemonk (user, 2026-10-30), so the gateway's idempotency is per user too. Global checks rejected one customer's file because of another's, and their messages named the other customer's file. |
| D-42 | 2026-10-30 | Every status poll stores the gateway's payout JSON verbatim in `payouts.gateway_response_json` (migration 0009); the **Raw** dialog shows it with each initiate attempt's request and response (`payout_attempts`). Owner and super admin only | User asked to see what UAPI actually returned. The extracted `gateway_status*` columns are truncated and drop fields. |
| D-12 | 2026-10-28 | ~~Real Postgres + `mock-gateway/`~~ Integration tests run against a real MySQL (`TEST_DATABASE_URL`) and an in-process fake gateway (`tests/helpers/fake-gateway.ts`) that implements the sandbox rules | The suite exercises the real SQL (locks, unique keys, CHECKs) without touching the sandbox. |

## 11. Open questions for the product owner
1. Confirm D-1 (`beneficiary_name` column).
2. Confirm default limits in §4.3 (per-txn 2,00,000; per-file 1 crore; date window 7 days).
3. Should `admin` be able to **cancel** PENDING payouts of a file (before dispatch)? (Not built yet; easy to add — only PENDING rows, atomic.)
4. Sandbox vs production credentials and base URLs.
5. D-3 consequence: is "same account + same amount + same date, twice" ever legitimate for you? If yes, the only safe fix is to add an extra column (e.g. `invoice_number`) into the fingerprint — tell me and I'll add it.

## 11.1 Terminology
| Term in UI | Column | Meaning |
|---|---|---|
| Reference | `payouts.client_reference_id` | the id from the user's file, sent verbatim to the gateway as its idempotency key; unique forever per user |
| **Remote ID** | `payouts.gateway_payout_id` | the gateway-issued `payout_id` (`TID…`) |
| UTR | `payouts.bank_transaction_id` | bank transaction reference, set on success |
| Gateway | `payouts.gateway_name` | which configured gateway processed the payout |

## 12. Test coverage map (`pnpm test`: 94 tests, vitest)

Integration tests run only against `TEST_DATABASE_URL` (a guard refuses anything else) and one file at a time;
fixtures are unique per run, so the suite repeats without cleanup. The worker runs against an in-memory UAPI
(`tests/helpers/fake-gateway.ts`) that follows the sandbox's first-digit rules and injects failures.

| What it protects | Test file |
|---|---|
| Money parsing and Indian grouping; fingerprints and canonical hash; CSV/XLSX parsing (BOM, CRLF, leading zeros, date cells) | `tests/unit/money`, `fingerprint`, `parse` |
| Every locked, tunable and custom rule in the validator, including switched-off rules | `tests/unit/validate.test.ts` |
| HMAC signature (pinned to an openssl vector), create-response classification, gateway status mapping | `tests/unit/gateway.test.ts` |
| Secret encryption (round trip, moved ciphertext, tampering); CSV formula-injection guard | `tests/unit/security.test.ts` |
| Rule-setting validation and summaries; list-query parsing (IST day ranges, unknown values dropped); pager links | `tests/unit/rules-and-lists.test.ts` |
| Locked rules at the DB level, reference/payment uniqueness, column types, SKIP LOCKED; key storage | `tests/integration/db.test.ts` |
| All-or-nothing ingest, fail-closed balance, duplicates with switches off, row errors, XLSX, concurrent uploads, custom rules, broken settings, audit, per-user limits | `tests/integration/ingest.test.ts` |
| Confirm payment, dispatch/poll, 500-but-created, timeout-not-created, crash after POST, two workers, balance waits and batch ledger, per-user circuit, revoked keys, cancel, admin reject, refund watch, fetch status, "never created twice" | `tests/integration/worker.test.ts` |
| Payout/file/user list queries: chip counts, field search (LIKE-escaped), amount/date filters, sort, paging, totals | `tests/integration/lists.test.ts` |

## 13. How to run (local)

```
docker compose --profile dev up -d db   # MySQL 8.4 on 127.0.0.1:3306 (dev only; production is RDS)
docker compose up -d vpn                # VPN egress proxy on 127.0.0.1:8888 — every outbound call needs it
docker compose up -d direct-proxy       # …or, where the tunnel can't run (another VPN on the Mac), a plain proxy on the same port
docker compose --profile app --profile novpn up -d --build   # the whole app in containers, built like prod, on :3400
pnpm migrate                            # applies migrations/*.sql to DATABASE_URL (.env.local)
# STORAGE_DRIVER=local keeps uploads in .storage/ (git-ignored); production uses s3
pnpm dev                                # http://localhost:3400
pnpm worker                             # dispatch / poll / reconcile loop (separate process)
pnpm test                               # full suite (unit + integration against TEST_DATABASE_URL)
pnpm test:unit                          # unit tests only, no database
pnpm verify                             # typecheck + lint + tests
```
`amusemonk_test` (same container) is `TEST_DATABASE_URL`; the test runner migrates it before running.

## 14. Production (AWS `eu-west-2`, London — D-37): three environments on one box (D-38, D-39)

| | **sandbox** | **fintech** (prod 1) | **galaxy** (prod 2) |
|---|---|---|---|
| URL | `sandbox.amusemonk.com` (noindex) | `fintech.amusemonk.com` | `galaxy.amusemonk.com` |
| Gateway + login | `sandbox.celestiapayment.com` | **not set yet** | **not set yet** |
| Database / user | `amusemonk_sandbox` / `amusemonk_sandbox_app` | `amusemonk_fintech` / `amusemonk_fintech_app` | `amusemonk_galaxy` / `amusemonk_galaxy_app` |
| Files | S3 `amusemonk-sandbox-files-<account>-eu-west-2` | S3 `amusemonk-fintech-files-…` | S3 `amusemonk-galaxy-files-…` |
| Config | SSM `/amusemonk/sandbox/*` → `sandbox.env` | `/amusemonk/fintech/*` → `fintech.env` | `/amusemonk/galaxy/*` → `galaxy.env` |
| Containers | `sandbox-web`, `sandbox-worker` | `fintech-web`, `fintech-worker` | `galaxy-web`, `galaxy-worker` |

An environment stays off until `/amusemonk/<env>/GATEWAY_BASE_URL` exists (box-deploy refuses). Each has its own
`AUTH_SECRET` and `SECRETS_KEY`, so a session or a stored key from one is useless in another. Each app user is granted
SELECT/INSERT/UPDATE on its own database only; checked 2026-10-30: each sees only its own database and `USE` on any other
fails with 1044. All share the box's instance role, so bucket separation is by configuration, not IAM.
`amusemonk.com` and `www` serve nothing (Caddy aborts the connection) until the landing page exists.

| Shared | What |
|---|---|
| Box | EC2 `t4g.small` (AL2023 arm64, 2 GB swap), tag `Name=amusemonk`, Elastic IP. SSH from the owner IP only (relay's key, `ec2-user`); deploys still go through SSM. IMDSv2 with hop limit 2 so containers get the instance role |
| Stack | `/opt/amusemonk/compose.prod.yml`: `vpn` (gluetun → Proton, India/Singapore exits), the four app services behind compose profiles (an environment is on once it has a line in `revisions`), `caddy` (Let's Encrypt; config dir `caddy/`, reloaded on every deploy) |
| RDS | MySQL 8.4 `amusemonk` (db.t4g.micro, private, encrypted, TLS required by param group `amusemonk-mysql84`, 7-day backups, deletion protection). `amusemonk_admin` runs migrations only (D-35) |
| Images | ECR `amusemonk-web`, `amusemonk-worker`, tagged by commit; last 15 kept |
| Config | `/amusemonk/shared/*` (VPN login) → `.env`; `/amusemonk/admin/<env>/MIGRATE_DATABASE_URL` and `/amusemonk/admin/DEPLOY_BUCKET` (bundles go to `amusemonk-files-…/deploy/`) are read only by the deploy scripts. Generated secrets are backed up in the owner's private vault |
| Network | SG `amusemonk-web`: 80/tcp, 443/tcp+udp in, 22/tcp from the owner IP. SG `amusemonk-db`: 3306 from `amusemonk-web` only. Gatekeeper and UAPI calls leave via the VPN; S3 and RDS are direct (D-28) |
| Logs + metrics | logmania agent (systemd) ships every container's logs, host metrics and the Caddy certificates to `portal.logmania.dev`, direct (own infra, like D-28). Box config: `../logmania/agents/amusemonk.conf`; upgrade with logmania's `./agent.sh install amusemonk` |

```
scripts/deploy.sh sandbox    # AWS creds in env. Build arm64 images for HEAD → ECR, upload deploy/ → S3, then on the box
                             # (SSM): sandbox.env from Parameter Store, pull, migrate, up, check the live commit label
scripts/deploy.sh fintech    # same commit, no build: refuses unless its images are already in ECR (it went to sandbox);
scripts/deploy.sh galaxy     # likewise
ALLOW_DIRTY=1 scripts/deploy.sh sandbox   # ships <sha>-dirty; sandbox only, to verify before committing
aws ssm start-session --target <instance-id>   # then: cd /opt/amusemonk && docker compose -f compose.prod.yml logs -f sandbox-web
```
`vpn` unhealthy with `read UDPv4 [ECONNREFUSED]` in its log = gluetun's built-in Proton server list has gone stale:
bump the pinned gluetun image (v3.40.0 failed this way on 2026-10-29; v3.41.3 connects).
Rollback = run `box-deploy.sh <env> <older-sha>` on the box (`<env>` = sandbox | fintech | galaxy). Migrations are forward-only, so roll back code only across
releases that didn't add one.
