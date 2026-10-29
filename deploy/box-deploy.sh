#!/usr/bin/env bash
# Runs ON the EC2 box (via SSM): writes .env from Parameter Store, pulls the images for one commit, migrates,
# starts the stack, then reads the commit back off the running containers.
set -euo pipefail
REVISION="$1"
cd /opt/amusemonk
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

umask 077
aws ssm get-parameters-by-path --region "$REGION" --path /amusemonk/prod/ --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text | awk -F'\t' '{ sub(".*/", "", $1); print $1 "=" $2 }' > .env.new
printf 'REGISTRY=%s\nREVISION=%s\nAWS_REGION=%s\n' "$REGISTRY" "$REVISION" "$REGION" >> .env.new
mv .env.new .env

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker compose -f compose.prod.yml pull --quiet
# Migrations run with the schema-owner account, kept out of .env so the containers never see it.
MIGRATE_URL=$(aws ssm get-parameter --region "$REGION" --name /amusemonk/admin/MIGRATE_DATABASE_URL --with-decryption \
  --query Parameter.Value --output text)
docker compose -f compose.prod.yml run --rm --no-deps -e DATABASE_URL="$MIGRATE_URL" worker node_modules/.bin/tsx src/db/migrate.ts
docker compose -f compose.prod.yml up -d --remove-orphans

for svc in web worker; do
  live=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker compose -f compose.prod.yml ps -q "$svc")")
  [ "$live" = "$REVISION" ] || { echo "MISMATCH: $svc runs $live, expected $REVISION"; exit 1; }
done
echo "LIVE $REVISION"
docker compose -f compose.prod.yml ps --format '{{.Service}} {{.Status}}'
