#!/usr/bin/env bash
# Ship HEAD to one environment, then run box-deploy.sh on the box over SSM (the box has no SSH port).
# `sandbox` builds HEAD's images for arm64 and pushes them to ECR. The prods (`fintech`, `galaxy`) never build: they
# take only a commit whose images are already there, i.e. one that went to sandbox first.
set -euo pipefail
ENV="${1:-}"
case $ENV in sandbox | fintech | galaxy) ;; *) echo "usage: scripts/deploy.sh sandbox|fintech|galaxy"; exit 2 ;; esac
REGION=eu-west-2
REVISION=$(git rev-parse --short=12 HEAD)
if [ -n "$(git status --porcelain)" ]; then
  [ "$ENV" = sandbox ] && [ "${ALLOW_DIRTY:-}" = 1 ] ||
    { echo "Working tree is dirty: commit first, so $ENV runs exactly a commit (sandbox only: ALLOW_DIRTY=1 ships <sha>-dirty)."; exit 1; }
  REVISION="$REVISION-dirty"
fi
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
BUCKET=$(aws ssm get-parameter --region "$REGION" --name /amusemonk/admin/DEPLOY_BUCKET --query Parameter.Value --output text)
INSTANCE=$(aws ec2 describe-instances --region "$REGION" --filters Name=tag:Name,Values=amusemonk Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

[ "$ENV" != sandbox ] || aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
for target in web worker; do
  if [ "$ENV" = sandbox ]; then
    docker buildx build --platform linux/arm64 --provenance=false --sbom=false --target "$target" --build-arg REVISION="$REVISION" \
      -t "$REGISTRY/amusemonk-$target:$REVISION" --push .
  else
    aws ecr describe-images --region "$REGION" --repository-name "amusemonk-$target" --image-ids imageTag="$REVISION" >/dev/null 2>&1 ||
      { echo "amusemonk-$target:$REVISION is not in ECR: deploy this commit to sandbox first."; exit 1; }
  fi
done

if [[ $REVISION == *-dirty ]]; then
  COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs --uid 0 --gid 0 --uname root --gname root -czf - -C deploy .
else
  git archive --format=tar.gz HEAD:deploy
fi | aws s3 cp - "s3://$BUCKET/deploy/$REVISION.tgz"
CMD=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "deploy $ENV $REVISION" --timeout-seconds 900 \
  --parameters "commands=[\"mkdir -p /opt/amusemonk && aws s3 cp s3://$BUCKET/deploy/$REVISION.tgz - | tar xz -C /opt/amusemonk && bash /opt/amusemonk/box-deploy.sh $ENV $REVISION\"]" \
  --query Command.CommandId --output text)
invocation() { aws ssm get-command-invocation --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" --query "$1" --output text; }
while :; do
  STATUS=$(invocation Status 2>/dev/null || echo Pending)
  case $STATUS in Pending | InProgress | Delayed) sleep 5 ;; *) break ;; esac
done
invocation '[StandardOutputContent,StandardErrorContent]'
[ "$STATUS" = Success ] || { echo "Deploy $ENV $REVISION: $STATUS"; exit 1; }
