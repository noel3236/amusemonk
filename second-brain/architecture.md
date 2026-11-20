---
name: architecture
description: amusemonk stack and versions, processes, source modules, MySQL data model (tables, keys, constraints), and the gateway/AWS integrations
metadata:
  type: project
---

# amusemonk: architecture

## Stack (package.json, 2026-10-29)
| Layer | Choice |
|---|---|
| Runtime | Node 22 (`node:22-alpine` images), pnpm `8.15.4` via corepack (`packageManager`), TypeScript 5 strict |
| Web | Next.js `16.3.0` App Router, RSC-first, `output: 'standalone'`, React `19.2.4`, server actions (body limit 21 MB) |
| Auth | `next-auth` `5.0.0-beta.32`, Credentials provider, JWT sessions (24 h) |
| DB | MySQL 8.4 (RDS in prod, `mysql:8.4` container locally) via `kysely` `^0.29.7` + `mysql2` `^3.24.6`; hand-written SQL migrations |
| Files | `@aws-sdk/client-s3` (S3 in prod) or a local folder (`.storage/`) |
| Parsing | `csv-parse` 7, `exceljs` 4.4 (first sheet of an XLSX) |
| Validation | `zod` 4 (env, rule params, URLs) |
| Outbound HTTP | `undici` 7 `ProxyAgent` (all gatekeeper/UAPI calls go through the VPN proxy) |
| UI | Tailwind 4 (`@tailwindcss/postcss`), `radix-ui`, `lucide-react`, `sonner`, `input-otp`, `next-themes`, `class-variance-authority`, `tw-animate-css`; fonts Manrope + IBM Plex Mono |
| Dates | `luxon` (IST business day, viewer time zone) |
| Tests | `vitest` 4 (`vitest.config.mts`), real MySQL for integration |
| Edge | Caddy `2.8-alpine` (TLS via Let's Encrypt), gluetun `qmcgaw/gluetun:v3.41.3` (Proton OpenVPN over TCP, India/Singapore exits) |

## Processes
- **web** — Next.js server (`node server.js`, port 3400). Pages, server actions, CSV download route handlers.
- **worker** — `tsx src/worker/main.ts`, same source tree. Dispatch every 5 s (batch 10), poll every 30 s, reconcile
  every 60 s. Any number may run: claims use `FOR UPDATE SKIP LOCKED`. The worker image also runs migrations.
- **vpn** — gluetun exposing an HTTP proxy on `:8888`; `EGRESS_PROXY_URL` points at it.
- **caddy** — TLS for every hostname, static landing site, scanner-probe 404s, per-env routing files.
- **db** — MySQL. In prod one RDS instance holds `amusemonk_sandbox`, `amusemonk_fintech`, `amusemonk_galaxy`.

## Source modules (src/)
| Folder | What lives there |
|---|---|
| `app/(auth)/login` | two-step login form (password, then OTP if gatekeeper asks) and its server action |
| `app/(app)/…` | `dashboard`, `files`, `files/[id]` (+ `status.csv`, `original` route handlers), `files/sample.csv`, `payouts`, `profile`, `uploads/[id]/errors.csv`, `admin/{files,users,rules}`; the `(app)` layout redirects to `/login` when there is no session or the user row is gone |
| `auth/` | `index.ts` NextAuth config; `gatekeeper.ts` login/logout/`gatekeeperCall`; `session.ts` reads gatekeeper creds from the JWT; `roles.ts` (`super_admin`) |
| `db/` | `index.ts` (one Kysely per process, survives hot reload), `pool.ts` (UTC session zone, BIGINT as strings, TINYINT(1) as boolean, RDS CA when `DB_SSL=rds`), `migrate.ts`, `schema.ts` (table types), `users.ts` |
| `gateway/` | `client.ts` (balance, findByClientReference, findByPayoutId, createPayout + response classification), `signing.ts`, `rate-limiter.ts` (token bucket per key, `GATEWAY_MAX_RPS` default 5, max 20), `config.ts`, `types.ts` |
| `features/api-keys` | encrypted key storage (`server.ts`), generate / revoke / delete actions, gateway key list UI |
| `features/balance` | balance snapshot table read/write |
| `features/ingest` | `parse.ts`, `validate.ts`, `fingerprint.ts`, `service.ts` (the all-or-nothing ingest), upload dialog, rejected-uploads table |
| `features/files` | approval/cancel (`approval.ts`), admin reject (`admin.ts`), list queries (`lists.ts`), list specs (`specs.ts`), file detail, decision dialog, look-alike warning, access checks |
| `features/rules` | rule catalog + param schemas (`catalog.ts`, client-safe), rule storage/audit/overrides (`server.ts`), Rules screen controls |
| `features/profile` | gatekeeper account, TOTP enable/disable, password change, key create/list/delete |
| `features/users` | admin user list, per-user limits dialog |
| `lib/` | `egress.ts` (the ONLY place allowed to call `fetch`), `crypto.ts`, `money.ts`, `storage.ts`, `csv.ts`, `list-params.ts`, `list-spec.ts`, `format.ts`, `timezones.ts`, `viewer-zone.ts`, `limits.ts` (20 MB hard cap; import-free because `next.config.ts` imports it), `errors.ts` (gatekeeper error codes) |
| `ui/` | own design system; everything is imported from the `@/ui` barrel |
| `worker/` | `main.ts`, `dispatcher.ts`, `poller.ts`, `reconciler.ts`, `status.ts` (status mapping, file status SQL, backoff), `refresh.ts` (one-payout "Fetch status"), `circuit.ts`, `deps.ts` (injectable gateway for tests), `config.ts` |

**Lint guardrails** (`eslint.config.mjs`): bare `fetch` is banned in `src/**` except `src/lib/egress.ts`; `radix-ui`,
`lucide-react`, `next-themes`, `sonner`, `input-otp` and `@/ui/*` internals may only be imported inside `src/ui/**`.

**Design system** (`src/app/globals.css`): own oklch tokens, light theme "Sandstone" (default) and dark theme "Night"
(`[data-theme='night']`); tones `ok`/`warn`/`bad`/`info` with `-soft` variants. Compact density rules are in
`feedback-ui-density.md`.

## Data model (MySQL 8, `migrations/0001`–`0010`)
All ids are app-generated UUID `CHAR(36)` (MySQL has no `RETURNING`). Money is `BIGINT` paise read as strings, never a
JS float. `DATETIME(3)` in UTC (session `time_zone` pinned to `+00:00`). Every table has `created_at`. Nothing is
hard-deleted (custom rules, overrides: soft). Full column lists: CONTEXT.md §5 and the SQL files.

| Table | Purpose | Notable keys / constraints |
|---|---|---|
| `users` | local mirror of gatekeeper users, upserted on every login | `UNIQUE(gatekeeper_uid)`; `gatekeeper_role` copied from gatekeeper |
| `user_api_keys` | the UAPI key each user's payouts are signed with; `secret_enc` AES-256-GCM | `UNIQUE(kid)`; generated column `active_user_id` + `UNIQUE` ⇒ at most one active key per user; `origin` `pasted`/`generated` (0007) |
| `user_balances` | last balance (and last error) read with each user's key | PK `user_id` |
| `upload_rules` | the rule set (global, one set) | `UNIQUE(rule_key)`; `CHECK(NOT locked OR enabled)`, `CHECK(NOT locked OR deleted_at IS NULL)`; 14 rows seeded in 0002, `similar_files` added in 0010 |
| `upload_rule_changes` | audit of every rule edit and per-user override | actions `created/updated/enabled/disabled/deleted/override_set/override_cleared`; `target_user_id` (0005) |
| `user_rule_overrides` | per-user settings for the six limit rules (D-33) | `UNIQUE(user_id, rule_id)`; `cleared_at` (0006) |
| `payout_files` | one accepted file | status ENUM `AWAITING_APPROVAL, ACCEPTED, PROCESSING, COMPLETED, COMPLETED_WITH_FAILURES, FAILED, CANCELLED, REJECTED`; `warnings_json`, `rules_snapshot_json`; per-user indexes (not unique) on normalized filename, raw sha256, canonical sha256 (0008) |
| `payouts` | one row per file row = one gateway payout | `UNIQUE(user_id, client_reference_id)`, `UNIQUE(user_id, content_fingerprint)` (0008, were global), `UNIQUE(file_id, file_row)`, `UNIQUE(gateway_payout_id)`; status ENUM `PENDING, DISPATCHING, PROCESSING, UNKNOWN, SUCCEEDED, FAILED, REFUNDED, CANCELLED`; `next_poll_at`, `locked_at/by`, `poll_failures`; `gateway_response_json` (0009) |
| `payout_attempts` | every dispatch/adopt/reconcile interaction | `UNIQUE(payout_id, attempt_no)`; outcome `STARTED, ADOPTED_EXISTING, CREATED, FAILED, UNKNOWN, DEFERRED`; `request_json`, `response_json` |
| `upload_attempts` | every upload, accepted or rejected, with its error list and stored raw file key | — |
| `webhook_events` | created for gateway callbacks | **unused**: no webhook route exists (D-31) |
| `schema_migrations` | created by the runner | names of applied files |

`client_reference_id` uses MySQL's default case-insensitive collation, so `ABC` and `abc` collide: stricter than the
gateway, therefore safe. Uniqueness is per user since D-41 (2026-10-30).

## Integrations in detail
- **Gatekeeper login**: `POST {GATEWAY_BASE_URL}/api/v3/gatekeeper/identity/sessions` with email, password and
  `otp_code`; the reply's `Set-Cookie` values and `csrf_token` are kept **only inside the encrypted NextAuth JWT**; the
  browser session object carries just user id, email and role. Later gatekeeper calls send `Cookie` + `X-CSRF-Token`.
- **UAPI signing** (`src/gateway/signing.ts`): `X-Auth-Apikey: kid`, `X-Auth-Nonce: <ms timestamp>`,
  `X-Auth-Signature: hex(HMAC-SHA256(secret, nonce + kid))`. The nonce is accepted for about 50 s.
- **Keys** are created by amusemonk with `scope: "uapi"` and `whitelisted_ips: ["*"]`: gatekeeper treats an EMPTY
  whitelist as deny-all, and the VPN exit IP rotates (D-23, D-40).
- **Encryption at rest** (`src/lib/crypto.ts`): AES-256-GCM, format `v1:<iv>:<tag>:<ct>` (base64), key `SECRETS_KEY`
  (32 bytes base64), associated data `user_api_keys:<kid>` so a ciphertext moved to another row fails to decrypt.
  Losing or changing `SECRETS_KEY` makes every stored secret unreadable.
- **S3**: SSE-AES256, keys `uploads/<userId>/<attemptId>/<safe-filename>`; instance-role credentials; direct (D-28).
- **RDS**: TLS required by param group `amusemonk-mysql84`; app users have SELECT/INSERT/UPDATE on their own database
  only; `amusemonk_admin` runs migrations (D-35).

## Environment variables (names only; values live in `.env.local` locally, SSM in prod)
`GATEWAY_BASE_URL`, `GATEWAY_MAX_RPS`, `GATEWAY_TIMEOUT_MS`, `EGRESS_PROXY_URL`, `DATABASE_URL`, `DB_SSL` (`off`/`rds`),
`DB_POOL_SIZE`, `TEST_DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `SECRETS_KEY`, `STORAGE_DRIVER`
(`s3`/`local`), `LOCAL_STORAGE_DIR`, `S3_BUCKET`, `AWS_REGION`, `APP_REVISION` (set by the image), worker tunables
`WORKER_ID`, `DISPATCH_INTERVAL_SECONDS`, `DISPATCH_BATCH_SIZE`, `POLL_INTERVAL_SECONDS`, `RECONCILE_INTERVAL_SECONDS`,
`STUCK_AFTER_SECONDS`, `BALANCE_BACKOFF_SECONDS`, `REFUND_WATCH_DAYS`, `PENNY_DROP_REQUIRED`. See `.env.example`.

Related: [[how-it-works]], [[operations]], [[decisions]].
