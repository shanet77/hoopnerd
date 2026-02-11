#!/usr/bin/env sh
set -eu

HOST="${DEPLOY_HOST:?DEPLOY_HOST is required}"
USER="${DEPLOY_USER:?DEPLOY_USER is required}"
PATH_ON_VPS="${DEPLOY_PATH:?DEPLOY_PATH is required}"
PORT="${DEPLOY_PORT:-22}"
BRANCH="${DEPLOY_BRANCH:-main}"

ssh -p "$PORT" "$USER@$HOST" /bin/sh <<EOF
set -eu

if [ ! -d "$PATH_ON_VPS/.git" ]; then
  echo "Repo not found at $PATH_ON_VPS. Clone it first on VPS."
  exit 1
fi

cd "$PATH_ON_VPS"

echo "Fetching latest branch: $BRANCH"
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Deploying containers"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --remove-orphans

echo "Pruning unused images"
docker image prune -f
EOF
