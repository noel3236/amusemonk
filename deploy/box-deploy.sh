#!/usr/bin/env bash
# Runs ON the EC2 box (via SSM) for one environment: writes its env file from Parameter Store, pulls its images,
# migrates its database, starts its containers, then reads the commit back off them. The other environments'
# containers are left exactly as they are.
set -euo pipefail
ENV="$1" REVISION="$2"
case $ENV in sandbox | fintech | galaxy) ;; *) echo "usage: box-deploy.sh sandbox|fintech|galaxy <revision>"; exit 2 ;; esac
cd /opt/amusemonk
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
C="docker compose -f compose.prod.yml"

umask 077
params() {
  aws ssm get-parameters-by-path --region "$REGION" --path "/amusemonk/$1/" --with-decryption \
    --query 'Parameters[].[Name,Value]' --output text | awk -F'\t' '{ sub(".*/", "", $1); print $1 "=" $2 }'
}
params "$ENV" > "$ENV.env.new"
grep -q '^GATEWAY_BASE_URL=' "$ENV.env.new" || { echo "/amusemonk/$ENV/GATEWAY_BASE_URL is not set: $ENV stays off."; exit 1; }
printf 'AWS_REGION=%s\n' "$REGION" >> "$ENV.env.new"
mv "$ENV.env.new" "$ENV.env"

# One line per deployed environment; compose switches on exactly those.
touch revisions
{ grep -v "^${ENV^^}_REVISION=" revisions || true; echo "${ENV^^}_REVISION=$REVISION"; } > revisions.new
mv revisions.new revisions
{
  params shared
  printf 'REGISTRY=%s\n' "$REGISTRY"
  cat revisions
  printf 'COMPOSE_PROFILES=%s\n' "$(sed -nE 's/^([A-Z]+)_REVISION=.*/\1/p' revisions | tr 'A-Z' 'a-z' | paste -sd, -)"
} > .env

mkdir -p caddy/routes
for e in sandbox fintech galaxy; do
  if grep -q "^${e^^}_REVISION=" revisions; then echo "reverse_proxy $e-web:3400"; else echo 'respond "Not live yet." 503'; fi >"caddy/routes/$e.caddy"
done

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
$C pull --quiet "$ENV-web" "$ENV-worker" vpn caddy
# Migrations run with the schema-owner account, kept out of the env files so the containers never see it.
MIGRATE_URL=$(aws ssm get-parameter --region "$REGION" --name "/amusemonk/admin/$ENV/MIGRATE_DATABASE_URL" --with-decryption \
  --query Parameter.Value --output text)
$C run --rm --no-deps -e DATABASE_URL="$MIGRATE_URL" "$ENV-worker" node_modules/.bin/tsx src/db/migrate.ts
$C up -d --remove-orphans "$ENV-web" "$ENV-worker" vpn caddy
# The Caddyfile sits in a mounted directory, so the running proxy already sees the new one; reload keeps connections.
$C exec -T caddy caddy reload --config /etc/caddy/Caddyfile

for svc in "$ENV-web" "$ENV-worker"; do
  live=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$($C ps -q "$svc")")
  [ "$live" = "$REVISION" ] || { echo "MISMATCH: $svc runs $live, expected $REVISION"; exit 1; }
done
echo "LIVE $ENV $REVISION"
$C ps --format '{{.Service}} {{.Status}}'
