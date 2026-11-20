---
name: history
description: Dated timeline of amusemonk, newest first, from git log and the project notes (port build, AWS regions, environments, teardown)
metadata:
  type: project
---

# amusemonk: history (newest first)

Source: `git log --date=short --format='%h %ad %s'` (26 commits, all on `main`), CONTEXT.md decision log, and the
running log in `amusemonk-project.md`. Infra events that left no commit are marked "(no commit)".

## 2026-11-13 — logmania stops expecting the box
- logmania repo `e52f0d8` "Remove the amusemonk agent (box deleted)": `agents/amusemonk.conf` deleted. It must be
  re-created on rebuild (fields it had: HOST, SSH_USER=ec2-user, JOURNAL_UNITS, CERTS path of Caddy's volume).

## 2026-11-12 — AWS torn down until production (D-48) · `76f66b8`
- User: "production we will go next month". Deleted on the user's explicit yes: EC2 and its disk, the Elastic IP,
  RDS (no final snapshot, automated backups too), the 4 buckets, both ECR repos, 32 SSM parameters, both security
  groups, RDS parameter and subnet groups. IAM role `amusemonk-ec2` survives with no policies (org SCP denies
  `iam:DeleteRole`). Non-secret rebuild inputs exported to `_private/aws-teardown-2026-11-12/`.
- Project memory moved from `~/dev-notes/claude-memory/amusemonk/` into this repo's `second-brain/` (committed).

## 2026-11-01 — README (no commit)
- `README.md` written (file date). Still untracked on 2026-11-20.

## 2026-10-31 — move to us-east-1 · `0df7660`, `6698243`
- User moved production from London to N. Virginia (D-47): "new and not in production, so the move is low-risk".
  Rebuilt from scratch with fresh secrets and empty DBs; box `t4g.small`, RDS MySQL 8.4, buckets `*-us-east-1`.
- `0df7660` deploy region, D-47, example config. Sandbox deployed first as `33c714fd166c-dirty`, then clean at
  `0df7660ace84` (no commit for the infra).
- DNS cut-over by the user (Namecheap A records → the new EIP); Caddy got Let's Encrypt certs on its own. Verified:
  sandbox 307 → `/dashboard`, apex 200 (landing), `www` 301, fintech/galaxy 503 "Not live yet".
- London torn down on the user's word (box, EIP, RDS with a final snapshot that was deleted later the same day,
  buckets, ECR, 31 SSM params). Nothing remained in `eu-west-2`.
- `6698243` `.gitignore` gains `_private/`; `_private/README.md` lists SSM parameter names, no values.

## 2026-10-30 — environments, Profile, per-user duplicates, UI polish (14 commits)
- `1771b6b` landing page for amusemonk.com: static site with an in-browser payout demo (USD, no country, no login),
  served by Caddy with a strict CSP.
- `40368ea` two prods instead of one (D-39): `fintech` and `galaxy` beside `sandbox`, each isolated, off until its
  gateway URL is set. The single unused `prod` DB/user/params were deleted the same day.
- `6efa47e` run the whole app locally in Docker; `direct-proxy` (tinyproxy) for machines where the VPN can't run.
- `b934986` Profile tab (D-40): generate/revoke the payout key with 2FA, 2FA on/off, password change.
- `993b9ec` **duplicate checks per user** (D-41, migration 0008): one customer's files never block or reveal another's.
- `e44dbc7` comment trim (landing site, compose).
- `35524ae` payout and file filters (IFSC, failure reason, gateway status, file, row count, failed-only), the **Raw**
  UAPI response view (D-42, migration 0009), Confirm Payment stays open while confirming.
- `25c3235` go straight to review after an accepted upload; live status refresh every 3 s.
- `1f79135` file page header folded into one row (meta, Download menu, Cancel, Confirm).
- `622e3ba` upload → review → confirm in **one modal** with a shared decision component; **look-alike file warning**
  (D-44, migration 0010).
- `01f4435` Profile rework: list every gateway key, generate-only keys (paste path removed, D-43/D-45), 2FA and
  password dialogs; recover sign-ins whose user row is gone.
- `6ee76a1` copy icon on every amount, name, file name and id; pointer cursor; dialog bodies scroll.
- `e2fd460` dates in a chosen time zone with UTC + relative on hover (D-46); payout remarks tooltip; raw JSON copy;
  header refresh button.
- `33c714f` Caddy answers scanner probes with 404; undeployed environments answer "Not live yet".
- (no commit) logs + metrics shipped to logmania; SSH 22 opened to the owner's IP only.

## 2026-10-29 — the port, end to end, and first production (10 commits)
- `a6632b1` scaffold: Next.js, tooling, CONTEXT.md carried over, PLAN.md, the API guide PDF.
- `28be0a2` MySQL schema, migrations 0001–0006, DB client.
- `1360b44` VPN egress (`outboundFetch`), UAPI client, encrypted per-user keys.
- `d4c8077` rules engine, all-or-nothing ingest, storage, payout worker (dispatch/poll/reconcile).
- `70513f1` web app: auth, design system, every screen, admin panel (93 files, ~5.5k lines).
- `b61aedf` test suite (vitest; fake UAPI gateway; 94 tests per CONTEXT §12).
- `ba3c294` comment and unused-type trim.
- `e0125d3` AWS deploy: images, prod compose with VPN and Caddy, SSM-driven deploy.
- `cd6a16d` sandbox and prod split on one box (D-38).
- (no commit) a first build in `ap-south-1` (never asked for) was torn down; prod went live in **`eu-west-2`
  London** (D-37). Gotchas found that day: stale gluetun Proton list (v3.40.0 → v3.41.3), org SCP denies
  `s3:PutBucketPublicAccessBlock`, macOS `tar` leaks the local username into archives.
- Decisions that day: per-user keys, verbatim idempotency key (D-18), DB-stored rules (D-19), MySQL + S3 + EC2 (D-20),
  uploader confirms own file (D-29), READ COMMITTED claim (D-30), no webhooks (D-31), admin reject (D-32), per-user
  limits (D-33), paste-your-own-key (D-34, later reversed by D-45).

## 2026-10-28 — before the port
- Decisions D-1..D-16 were made in `file-to-api-payout` (Postgres era): required `beneficiary_name`, fingerprint
  duplicates always reject, no auto-retry after insufficient balance, cancelled files keep references consumed, etc.
  Sandbox environment facts recorded (CONTEXT §9.1.1).

Related: [[decisions]], [[amusemonk-project]].
