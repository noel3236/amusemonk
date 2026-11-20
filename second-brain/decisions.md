---
name: decisions
description: Key amusemonk decisions with their why and date, grouped by theme (money safety, keys, auth, rules, infra, UI), including superseded ones
metadata:
  type: project
---

# amusemonk: decisions

The full log is CONTEXT.md §10 (D-1..D-48); it wins when this summary and it disagree. Entries without a D-number come
from the user's rules recorded in `amusemonk-project.md` / `feedback-ui-density.md`. "User" = the product owner.

## Money safety (never pay twice)
- **D-18 (2026-10-29) Idempotency key = the file's `client_reference_id`, verbatim.** No `-R{n}` suffix, never
  derived. Why: one payout = one reference forever. Consequence the user accepted: an `insufficient_balance` failure
  burns the reference at the gateway, so it can't be retried in-app; re-upload with new ids. Supersedes D-2.
- **Check before create.** The worker asks `GET /payouts/status?client_reference_id=` before every POST and adopts an
  existing payout; a 500/timeout is `UNKNOWN`, never a blind retry; the reconciler decides. Why: a lost response must
  not cause a second payment (CONTEXT §6.1).
- **D-4 (2026-10-28) No automatic retry after `insufficient_balance`.** Auto-creating a new reference is exactly how a
  double pay happens if the first one went through.
- **D-3 (2026-10-28) Fingerprint duplicates always reject** (same account + IFSC + amount + date). A warn mode can't
  coexist with the `UNIQUE(content_fingerprint)` key, and the key is the point. Consequence: two genuine identical
  payments on one date must be merged or dated differently (open question 5).
- **D-19 / D-25 (2026-10-29) Rules live in the DB and are editable, but 4 are locked on**: `columns`, `row_format`,
  `duplicate_reference`, `duplicate_payment`, enforced in code and by DB `CHECK`s and unique keys. Why: disabling a
  duplicate check is how a payout goes out twice. 10 tunable rules + 2 custom templates (pattern, allow/block list);
  custom regexes are trusted super-admin input (≤200 chars), no RE2.
- **D-21 (2026-10-29) Duplicate-file checks (name, bytes, content) are switchable, so only indexed.** Safe because a
  repeated file carries the same references and the unique key rejects it in the same insert transaction.
- **D-26 (2026-10-29) One ingest lock** (`GET_LOCK`, ≤30 s then BUSY) around cross-file checks, balance check and insert;
  per user since D-41. Makes non-unique checks exact under concurrency.
- **D-8 Rejected files consume nothing; D-15 cancelled files keep references consumed** (2026-10-28). A typo must be
  fixable; a cancelled batch must not slip back in with one row "fixed".
- **D-27 (2026-10-29) Raw bytes of every upload are stored before checks**; storage failure rejects. Audit.
- **D-30 (2026-10-29) Claim runs at READ COMMITTED and retries a lost deadlock (≤3).** Found by the two-worker test:
  under REPEATABLE READ the SKIP LOCKED scan takes gap locks and two claims deadlock.
- **D-9 Penny drop on by default** (`PENNY_DROP_REQUIRED=true`); **D-10 available balance = gateway `balance` as-is**
  (not minus `locked`), matching the user's production Ruby adapter; change `availableBalancePaise()` if wrong.
- **D-44 (2026-10-30) Look-alike files warn, not reject**: same payout count and total as another of the user's files
  in the last 30 days ⇒ Confirm Payment needs an explicit "this isn't a repeat" tick. Why: catches a second upload of
  the same batch under new references, while monthly repeats stay legitimate.
- **Money as integer paise** (`bigint`) or decimal strings, never JS floats; DB `BIGINT`.

## Who approves, who sees what
- **D-29 (2026-10-29) The uploader confirms (and cancels) their own file; no one else can.** User: "its user file, he
  will approve". Replaces the source app's admin-only maker-checker (D-16 `FOUR_EYES` is legacy).
- **D-32 (2026-10-29) Admins may reject a file only before the user confirms**, status `REJECTED`. After confirmation
  payouts may already be at the gateway.
- **D-41 (2026-10-30) Duplicate checks are per user** (migration 0008). Why: each user pays from their own gateway
  account, and sub-users of one gateway merchant can't both use amusemonk; global checks rejected one customer's file
  because of another's and named the other customer's file. Never reintroduce global duplicate checks. Supersedes D-7.
- **D-33 (2026-10-29) Limits are global with per-user overrides** for six rules (settings only; on/off stays global).
- **D-22 (2026-10-29) Admin = gatekeeper `super_admin`**, no local role column; one global rule set.

## API keys
- **D-17 → D-34 → D-40 → D-43 → D-45, final state (2026-10-30): keys are generated only inside amusemonk** (Profile,
  needs a 2FA code; `scope: uapi`, `whitelisted_ips: ["*"]`), connected at once, secret never shown. Pasting a key
  made elsewhere was removed. Why: users have no gateway portal, so amusemonk is the only place to make, see or delete
  a key. Older pasted keys stay revocable (disconnect only, `origin = pasted`).
- **D-43 Profile lists every key on the gateway account**, labelled In use / Made by amusemonk; the in-use key has only
  Revoke (a generated one is also deleted at the gateway with a 2FA code); every other key has Delete with a 2FA code.
  A TOTP code is single-use, so replacing a key is revoke, then generate.
- **D-23 Whitelist `*`**: gatekeeper treats an empty whitelist as deny-all and the VPN exit rotates.
- **D-24 (2026-10-29) Admin "Revoke" only stops amusemonk using a key**; gatekeeper's admin `PATCH api_keys/:id` looks up
  `declared_params[:kid]` (nil) and always 404s. Revisit when atlas is fixed (not yet reported, per notes).

## Auth and egress
- **Auth = NextAuth Credentials against gatekeeper** (2026-10-29, cekko pattern). Gatekeeper cookie + CSRF stay inside
  the encrypted JWT. Same identity as the gateway account; no local passwords.
- **VPN egress for every outside call** (user rule, 2026-10-29): only `outboundFetch` may call out; ESLint bans bare
  `fetch`. Consequence: rotating exit IP, so keys can't be IP-whitelisted.
- **D-28 (2026-10-29) S3 and RDS are reached directly**, not via the VPN: own infra. Confirmed by the user. logmania
  traffic is direct for the same reason.
- **D-31 (2026-10-29) No webhooks yet**; polling every 30 s. Each user has their own gateway account and webhook secret.
- **D-46 (2026-10-30) Dates display in the viewer's chosen zone** (IST, UTC, Singapore, Dubai; default IST), but
  business days stay IST (date-window rule, upload "today", status CSV). A rule must not change meaning with a display
  preference.

## Infrastructure
- **D-20 (2026-10-29) RDS MySQL + S3 + one EC2 with Docker Compose** (web, worker, Caddy). Cheapest; the worker needs a
  long-running host. MySQL ≥ 8.0 gives `SKIP LOCKED`.
- **Always ask the region** (global rule after 2026-10-29): a first build in `ap-south-1` was picked without asking and
  torn down. **D-37 London `eu-west-2`** (2026-10-29) → **D-47 `us-east-1`** (2026-10-31, user: new product, a clean
  move is cheap now).
- **D-35 (2026-10-29) App DB users get SELECT/INSERT/UPDATE only**; `amusemonk_admin` runs migrations and its URL never
  reaches the containers. The app never deletes rows.
- **D-36 (2026-10-29) Deploys go through SSM Run Command**, images tagged by commit, deploy fails unless the running
  containers carry that commit's label. SSH 22 only from the owner's IP with relay's key, for logmania tooling.
- **D-38 → D-39 (2026-10-29/30) Three isolated environments on one box and one RDS**: `sandbox`, `fintech` (Prod 1),
  `galaxy` (Prod 2), each with its own gateway, database + DB user, bucket, secrets and hostname; prods only take images
  that went to sandbox first. Why: test on sandbox and run prods with no data mix-up, without buying more.
- **D-48 (2026-11-12) Delete everything until production starts** (next month per the user). Rebuild gets fresh
  secrets and empty databases.
- **D-12 Integration tests run against real MySQL** (`TEST_DATABASE_URL`) with an in-process fake gateway; D-5 (no
  SQLite) carries over. Locking/constraint semantics must match prod.
- **Landing page (user, 2026-10-30)**: amusemonk.com is a modern fintech landing page, no login, "Try the demo" opens a
  client-side demo, short how-it-works, never mentions the country; shown in USD.

## UI
- **Own design system; must not look like corona** (user, 2026-10-29). Client confidentiality, not taste: never copy
  corona's theme names, palette, logo or copy; reuse only architecture.
- **No page titles or descriptions; corona-level density** (user, 2026-10-29). See `feedback-ui-density.md`.
- **Desktop-first** (user, 2026-10-29): design and verify at desktop width; mobile only must not break.
- **Tables follow corona's structure**: status chips with counts, "Search by [field]", removable filter chips, Filters
  panel, pinnable + movable columns remembered per table.
- **Upload, review and confirm in one modal** (2026-10-30, `622e3ba`): one shared decision component used by the modal
  and the file page.

## Superseded or legacy (kept for context)
D-2 (`-R{n}` suffix) → D-18. D-6 (`RUN_WORKER` in-process) → separate worker process. D-7 (global uniqueness) → D-41.
D-13 (gateway credentials in DB via admin panel) → D-17/D-34/D-45. D-16 (`FOUR_EYES`) → D-29. D-23 creation path →
D-34 → D-45. D-37 London → D-47. D-38 single prod → D-39.

Related: [[history]], [[how-it-works]].
