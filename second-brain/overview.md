---
name: overview
description: What amusemonk is (file-to-UAPI payout bridge at amusemonk.com), who uses it, what it connects to, where it runs today, and the repo layout
metadata:
  type: project
---

# amusemonk: overview

**One line:** a web app where a merchant uploads a CSV/XLSX of bank payouts; the whole file is checked and either
accepted or rejected (never partly); after the user clicks **Confirm Payment**, a background worker sends every row as
one idempotent payout through the payment gateway's UAPI, signed with **that user's own API key**, and polls each
payout's status back. "Never pay twice" outranks every other goal (CONTEXT.md §1).

It is a Next.js port of an older Express + EJS + Postgres app called `file-to-api-payout`, started 2026-10-29. That
source repo is not under `~/Desktop/noel/` as of 2026-11-20 (checked by `ls`); CONTEXT.md and the decision log were
carried over from it, and decisions D-1..D-16 (2026-10-28) date from it.

## Status (2026-11-20)
- **Nothing is running.** Every AWS resource was deleted on 2026-11-12 on the user's word ("production we will go next
  month", CONTEXT D-48). Only the IAM role `amusemonk-ec2` survives (no policies; an org SCP denies `iam:DeleteRole`).
- The code is complete for a first release: auth, key onboarding, ingest + rules engine, worker, all screens, admin
  panel, 94-test suite (per CONTEXT §12), deploy scripts, landing page.
- Last commit `76f66b8` (2026-11-12). `README.md` exists in the working tree but is **untracked** (file date 2026-11-01).
- The two production environments (`fintech`, `galaxy`) never went live: they wait for gateway URLs from the user.

## Who uses it
- **Users** = accounts on the payment platform (Celestia; sandbox at `sandbox.celestiapayment.com`). They sign in with
  their platform email + password + OTP; there are no local passwords. Each pays from their own gateway balance.
  Users have no access to any gateway portal, so amusemonk is the only place they generate, see or delete keys (D-45).
- **Admins** = gatekeeper role `super_admin` (no local role column, D-22). They see all files, may reject a file only
  before its owner confirms (D-32), manage global upload rules and per-user limit overrides, and can disconnect a
  user's key. They play no part in approving payments (D-29).
- It is a **client-facing product**. It must not be recognisable as corona (a sibling noel product): the client must
  not be able to link the two. Corona is a structural reference only (see `amusemonk-project.md`).

## What it connects to
| Thing | How | Where |
|---|---|---|
| Gatekeeper (identity, 2FA, API keys) | `POST/DELETE /api/v3/gatekeeper/identity/sessions`, `/resource/users/me`, `/resource/totp*`, `/resource/users/password`, `/resource/api_keys*`; session cookie + CSRF | `GATEWAY_BASE_URL`; backend source is `~/Desktop/noel/atlas` (e.g. `app/api/api/v3/resource/api_keys.rb`) |
| UAPI (payouts) | `/uapi/v1/peatio/account/balances/inr`, `/payouts/initiate`, `/payouts/status`; HMAC headers | same host; API guide `docs/API-Integration-Guide.pdf` (version 2026-10-23). The `peatio` path suggests `~/Desktop/noel/peatio` is the backend (guess) |
| VPN egress | gluetun → Proton OpenVPN, HTTP proxy :8888; every gatekeeper/UAPI call goes through it | Proton login comes from `~/Desktop/noel/relay/_private/proton/darwin.env` (local copy: git-ignored `credentials/darwin.env`) |
| AWS (when running) | RDS MySQL 8.4, S3, EC2, ECR, SSM Parameter Store; reached directly, not via VPN (D-28) | account …9028, region `us-east-1` (D-47) |
| logmania | systemd agent on the box shipped container logs, host metrics and Caddy certs to `portal.logmania.dev` | `~/Desktop/noel/logmania`; its `agents/amusemonk.conf` was removed 2026-11-13 (logmania `e52f0d8`) because the box is gone |
| DNS | Namecheap A records for `@`, `www`, `sandbox`, `fintech`, `galaxy`; changed by the user, not by Claude | amusemonk.com |

Sibling repos used as references (read, never imported):
- `~/Desktop/noel/cekko` — auth pattern (`src/auth*.ts`) and the Profile tab design (D-40).
- `~/Desktop/noel/corona` — table/filter/shell structure, time-zone feature (D-46). Never copy its look.
- `~/Desktop/noel/relay` — Proton credentials and the SSH key the box accepted for `ec2-user`.
- spark (the owner's component registry) — `Copyable` was ported into `src/ui/data/copyable.tsx`.

## Where it ran (until 2026-11-12)
One EC2 `t4g.small` (arm64) in `us-east-1` running Docker Compose: `vpn`, `caddy`, and a `web` + `worker` pair per
environment. One RDS instance with a database per environment. Hostnames:
- `amusemonk.com` — static landing page with an in-browser demo (`deploy/caddy/site/`), `www` redirects to it.
- `sandbox.amusemonk.com` — the sandbox environment against the Celestia sandbox gateway (was live).
- `fintech.amusemonk.com` (Prod 1), `galaxy.amusemonk.com` (Prod 2) — answered "Not live yet" (503).
Earlier: a London (`eu-west-2`) build 2026-10-29..31, and a first `ap-south-1` build torn down on 2026-10-29.
Details: `operations.md`, CONTEXT.md §14.

## Repo layout
```
CONTEXT.md        source of truth: file contract, rules, data model, state machine, decision log D-1..D-48, prod setup
PLAN.md           the port's decisions table + the 10 build steps (2026-10-29)
README.md         short intro, run locally, deploy (untracked as of 2026-11-20)
docs/API-Integration-Guide.pdf   the gateway's API guide
migrations/       0001..0010 SQL, applied in name order by src/db/migrate.ts
src/
  app/            Next.js App Router: (auth)/login, (app)/{dashboard,files,payouts,profile,admin,uploads}, api/auth
  auth/           NextAuth Credentials → gatekeeper; gatekeeper client; super_admin check
  db/             Kysely client, mysql2 pool, migration runner, schema types, user upsert
  gateway/        UAPI client, HMAC signing, token-bucket rate limiter, response types
  features/       api-keys, balance, files, ingest, profile, rules, users (server code + their UI pieces)
  lib/            egress (the only outbound fetch), crypto, money, storage (S3/local), CSV, list params, time zones
  ui/             own design system: primitives (Radix), atoms, data table, filters, shell, time, icons (barrel @/ui)
  worker/         dispatcher, poller, reconciler, status mapping, circuit breaker, main loop
tests/            vitest: unit/, integration/ (real MySQL), helpers/ (fake UAPI gateway, fixtures)
deploy/           box-deploy.sh, compose.prod.yml, caddy/ (Caddyfile + landing site)
scripts/deploy.sh ship HEAD to sandbox | fintech | galaxy
docker-compose.yml local: vpn | direct-proxy, MySQL 8.4, and the whole app in containers
Dockerfile        one build, two targets: web (Next standalone) and worker (tsx)
second-brain/     this memory (git-tracked)
_private/         git-ignored: README of where secrets live + aws-teardown-2026-11-12/ rebuild inputs
credentials/      git-ignored: darwin.env (Proton login for local gluetun)
.claude/launch.json  preview entries: `amusemonk` (pnpm dev, :3400) and `landing` (static site, :3401)
```

Git: remote `git@github-work:noel3236/amusemonk.git` (noel identity, pushed over the `github-work` SSH alias), single branch `main`, 26 commits
from 2026-10-29 to 2026-11-12. No CI workflow. No commit-message ticket prefix is used.

Related: [[architecture]], [[history]], [[operations]], [[amusemonk-project]] (the original running log).
