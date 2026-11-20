---
name: operations
description: Run amusemonk locally, test, build, deploy and roll back; the (deleted) AWS us-east-1 setup and how to rebuild it; where secrets live; migrations, backups, logs and gotchas
metadata:
  type: project
---

# amusemonk: operations

README.md and CONTEXT.md §13 (local) / §14 (production) are the primary docs; this adds the state of things and the
lessons from the project log.

## Run locally
```bash
cp .env.example .env.local              # then fill AUTH_SECRET and SECRETS_KEY (openssl rand -base64 32)
docker compose --profile dev up -d db   # MySQL 8.4 on 127.0.0.1:3306 (compose creates only the `amusemonk` database)
docker compose up -d vpn                # gluetun on 127.0.0.1:8888, needs credentials/darwin.env
#   or: docker compose --profile novpn up -d direct-proxy   (plain tinyproxy where the tunnel can't run, e.g. another VPN on the Mac)
pnpm install && pnpm migrate
pnpm dev                                # http://localhost:3400
pnpm worker                             # separate process
docker compose --profile app --profile novpn up -d --build   # whole app in containers, built like prod, on :3400
```
- Package manager is **pnpm 8.15.4** (`packageManager`), not yarn. Node 22.
- `.env.example` defaults `GATEWAY_BASE_URL` to the Celestia sandbox; logging in needs a real sandbox gateway account.
- Local dev DB credentials are the throwaway ones in `docker-compose.yml`; `.env.local` is git-ignored.
- Proton login for gluetun: `credentials/darwin.env` (git-ignored copy of `~/Desktop/noel/relay/_private/proton/darwin.env`).
  Override with `VPN_ENV_FILE`.
- `STORAGE_DRIVER=local` keeps uploads in `.storage/` (git-ignored).
- Preview entries in `.claude/launch.json`: `amusemonk` (`pnpm dev`, port 3400), `landing` (static site, port 3401).
- Per the earlier log, the user tested on the local Docker run (`--profile app --profile novpn`) against the sandbox
  gateway.

## Test and check
- `pnpm verify` = `tsc --noEmit && eslint && vitest run`. `pnpm test` (all), `pnpm test:unit` (no DB needed).
- Integration tests need `TEST_DATABASE_URL` (the `amusemonk_test` DB in the same container). Compose doesn't create
  it, so on a fresh volume it must be created and granted to the dev user by hand (inferred from `docker-compose.yml`;
  not written down anywhere). The runner migrates it first, files run one at a time, fixtures are unique per run so no cleanup is needed. `requireTestDatabase()` refuses
  anything else. CONTEXT §12 says 94 tests (2026-10-29); not re-run for this note.
- `.env.example` still mentions `pnpm checks` (replaced by `pnpm test` on 2026-10-29).

## Build
`Dockerfile` targets `web` and `worker` (see `how-it-works.md` §11). Build arg `REVISION` becomes the image label the
deploy verifies. Prod images are `linux/arm64` (Graviton `t4g`).

## Deploy and roll back (when infra exists)
```bash
scripts/deploy.sh sandbox                 # AWS creds in env; builds arm64 images for HEAD → ECR, ships deploy/, runs box-deploy over SSM
scripts/deploy.sh fintech | galaxy        # same commit, no build; refuses unless the images are in ECR (went to sandbox first)
ALLOW_DIRTY=1 scripts/deploy.sh sandbox   # ships <sha>-dirty; sandbox only; redeploy after committing
aws ssm start-session --target <instance-id>   # then: cd /opt/amusemonk && docker compose -f compose.prod.yml logs -f sandbox-web
```
- An environment is off until `/amusemonk/<env>/GATEWAY_BASE_URL` exists; until deployed its host answers 503
  "Not live yet".
- **Rollback**: on the box, `bash /opt/amusemonk/box-deploy.sh <env> <older-sha>`. Migrations are forward-only, so only
  roll back across releases that added none.
- Landing-page-only change: copy `deploy/caddy` to `/opt/amusemonk/caddy` and `caddy reload` (no app rebuild); this was
  done for `1771b6b`.
- Not on CI: `~/Desktop/noel/TODO.md` (2026-11-17) lists amusemonk among projects to move to GitHub Actions → GHCR
  images (copy `opsmania/.github/workflows/images.yml`, `ubuntu-24.04-arm` runner) and switch the deploy to pull.

## Production: state and layout
**Since 2026-11-12 nothing exists (D-48).** CONTEXT §14 describes the stack to rebuild. What it was (2026-10-31..11-12):
| Piece | Value |
|---|---|
| AWS account / region | …9028 (`302165639028`), `us-east-1` (D-47). Earlier `eu-west-2` London (torn down 2026-10-31) and `ap-south-1` (torn down 2026-10-29) |
| Box | EC2 `t4g.small`, AL2023 arm64, 2 GB swap, tag `Name=amusemonk`, Elastic IP, IMDSv2 hop limit 2 (containers use the instance role), Docker 25 + Compose plugin; stack in `/opt/amusemonk` |
| RDS | MySQL 8.4 `amusemonk`, `db.t4g.micro`, private, encrypted, TLS required (param group `amusemonk-mysql84`, `require_secure_transport=1`), 7-day backups, deletion protection. Databases `amusemonk_{sandbox,fintech,galaxy}` with users `amusemonk_<env>_app` (SELECT/INSERT/UPDATE on own DB); `amusemonk_admin` runs migrations |
| S3 | `amusemonk-files-<acct>-us-east-1` (deploy bundles under `deploy/`) + `amusemonk-{sandbox,fintech,galaxy}-files-<acct>-us-east-1`; versioning, AES256, lifecycle rules |
| ECR | `amusemonk-web`, `amusemonk-worker`, scan on push, last 15 kept |
| SSM | `/amusemonk/<env>/*` (env config incl. `AUTH_SECRET`, `SECRETS_KEY`, `DATABASE_URL`, `GATEWAY_BASE_URL`), `/amusemonk/shared/*` (VPN login), `/amusemonk/admin/<env>/MIGRATE_DATABASE_URL`, `/amusemonk/admin/DEPLOY_BUCKET`, `/amusemonk/admin/DB_MASTER_PASSWORD` (the only copy of the RDS master password) |
| SGs | `amusemonk-web`: 80/tcp, 443/tcp+udp, 22/tcp from the owner's IP only. `amusemonk-db`: 3306 from `amusemonk-web` |
| IAM | role `amusemonk-ec2` (still exists, no policies): inline `amusemonk-runtime-us-east-1` + managed SSM core and ECR read-only |
| Containers | `vpn`, `caddy`, `<env>-web`, `<env>-worker`; json-file logs 10 MB × 5 |
| DNS | Namecheap A records `@`, `www`, `sandbox`, `fintech`, `galaxy` → the EIP; TTL 1800; set by the user |
| Logs | logmania agent (systemd) → `portal.logmania.dev`, direct |

## Rebuild checklist (from D-48 and the notes)
Inputs: `_private/aws-teardown-2026-11-12/` (box user-data and launch JSON, volume, SG rules, IAM trust + runtime
policy + attached policies, bucket and ECR rules, RDS instance/param/subnet group, plain SSM config TSV, secret
parameter **names**). Generic recipe: `~/dev-notes/aws-region-move-docker-stack.md`.
1. Confirm the region with the user (never pick one). Last decision: `us-east-1`.
2. Reuse role `amusemonk-ec2`: new instance profile, re-put `amusemonk-runtime-us-east-1`, re-attach SSM core + ECR
   read-only managed policies.
3. SGs, ECR repos, buckets (strip `TransitionDefaultMinimumObjectSize` from the exported lifecycle before import; skip
   `PutBucketPublicAccessBlock`, an org SCP denies it and new buckets already block), RDS subnet group (avoid
   `us-east-1e`, no RDS there) + param group + instance.
4. Launch the box from the user-data (docker, compose plugin, 2 GB swap), IMDSv2 hop limit 2, tag `Name=amusemonk`,
   Elastic IP.
5. Hand to the user (Claude's auto-mode refuses these): SSH 22 ingress from the owner's IP, relay's pubkey for `ec2-user`.
6. DB setup from the box: three databases, `amusemonk_<env>_app` users (TLS, SELECT/INSERT/UPDATE), `amusemonk_admin`.
7. SSM params with **fresh** secrets per environment; `GATEWAY_BASE_URL` only for environments that should go live.
8. `scripts/deploy.sh sandbox` (check `REGION` in the script), then prods once the user gives their gateway URLs.
9. User: Namecheap A records → new EIP. Caddy then issues certificates itself.
10. logmania: re-create `~/Desktop/noel/logmania/agents/amusemonk.conf` (HOST=<new EIP>, SSH_USER=ec2-user,
    JOURNAL_UNITS=logmania-agent.service, CERTS under the `amusemonk_caddy_data` volume) and run `./agent.sh install
    amusemonk`. logmania keeps the `amusemonk` box row with `last_seen` NULL, so its silence rule skips it until then.
11. Back up any generated secret in the owner's private vault, as before.

## Secrets: where they live (never in git)
- `_private/README.md` (git-ignored): the SSM parameter names; no values. `_private/aws-teardown-2026-11-12/`:
  non-secret exports.
- AWS CLI key: the shared key file in the vault's `~/dev-notes/_private/` (named in `_private/README.md`); the `~/.aws`
  default key is invalid (per the 2026-10-29 log).
- Proton VPN login: `~/Desktop/noel/relay/_private/proton/darwin.env`; box SSH key: `~/Desktop/noel/relay/_private/`.
- `SECRETS_KEY` loss or change makes every stored UAPI secret unreadable; users must generate a new key.

## Backups
- RDS automated 7-day backups while it existed. None now (data deleted 2026-11-12 with no final snapshot; it held only
  sandbox data). There is no `scripts/amusemonk-server-backup.sh`, so `~/Desktop/noel/tools/project-backups` doesn't
  cover amusemonk.

## Gotchas (all observed in this project)
- `exceljs` must NOT be in `serverExternalPackages` (its nested `generator-function` `.mjs` breaks Next's require).
- `next.config.ts` can't import files that use the `@/` alias, hence the import-free `src/lib/limits.ts`.
- Local storage needs `/* turbopackIgnore: true */ process.cwd()` or standalone output traces the whole repo.
- Vitest config is `.mts`: with `.ts` there's a CJS/ESM warning because package.json has no `"type"`.
- `requireTestDatabase` is named without `use…` so the React hooks lint rule ignores it.
- MySQL: SKIP LOCKED under REPEATABLE READ deadlocks two workers via gap locks → READ COMMITTED + retry (D-30). No
  transactional DDL. `GET_LOCK` returns a BIGINT, i.e. the string `'1'` with `bigNumberStrings`.
- gluetun's built-in Proton server list goes stale: `vpn` unhealthy with `read UDPv4 [ECONNREFUSED]` ⇒ bump the pinned
  image (v3.40.0 failed on 2026-10-29; v3.41.3 works). Compose uses OpenVPN over TCP.
- macOS `tar` writes the local username into archives: `deploy.sh` uses `--uid 0 --gid 0 --uname root --gname root`
  and `COPYFILE_DISABLE=1` for dirty bundles.
- The Bash tool runs zsh: `$var` isn't word-split (pass `$(cmd)` or `${=var}`), `$var:tag` is a history modifier
  (write `${var}:tag`). Recipe: `~/dev-notes/zsh-scripted-shell-traps.md`.
- Org SCPs deny `s3:PutBucketPublicAccessBlock` and `iam:DeleteRole`.
- Gatekeeper treats an empty `whitelisted_ips` as deny-all; keys use `["*"]`.
- DNS TTL was left at 1800; Namecheap changes are the user's.
- Two London-era boxes once reported to logmania under the same name `amusemonk`; tear down the old one before the
  new one reports, or rename.

Related: [[overview]], [[open-work]], [[amusemonk-project]].
