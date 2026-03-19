#!/usr/bin/env bash
set -euo pipefail

DEPLOY_TARGET_PATH="${DEPLOY_PATH:-${PATH_ON_VPS:-}}"
: "${DEPLOY_TARGET_PATH:?DEPLOY_PATH or PATH_ON_VPS is required}"

cd "${DEPLOY_TARGET_PATH}"

if [ -d .git ]; then
  git fetch --all --prune
  git checkout main
  git pull --ff-only
fi

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  up -d --build --remove-orphans

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  ps
