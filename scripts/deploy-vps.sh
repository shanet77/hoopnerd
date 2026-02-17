#!/usr/bin/env sh
set -eu

HOST="${DEPLOY_HOST:?DEPLOY_HOST is required}"
USER="${DEPLOY_USER:?DEPLOY_USER is required}"
PATH_ON_VPS="${DEPLOY_PATH:?DEPLOY_PATH is required}"
PORT="${DEPLOY_PORT:-22}"
BRANCH="${DEPLOY_BRANCH:-main}"
BUILD_ON_VPS="${DEPLOY_BUILD_ON_VPS:-1}"
PRUNE_AFTER_DEPLOY="${DEPLOY_PRUNE_AFTER_DEPLOY:-0}"
REGISTRY_URL="${DEPLOY_REGISTRY_URL:-}"
REGISTRY_USER="${DEPLOY_REGISTRY_USER:-}"
REGISTRY_PASSWORD="${DEPLOY_REGISTRY_PASSWORD:-}"
IMAGE_TAG="${DEPLOY_IMAGE_TAG:-latest}"
API_IMAGE="${DEPLOY_API_IMAGE:-}"
WEB_IMAGE="${DEPLOY_WEB_IMAGE:-}"

ssh -p "$PORT" "$USER@$HOST" /bin/sh <<EOF_REMOTE
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

COMPOSE_CMD="docker compose -f docker-compose.prod.yml --env-file .env.prod"

if [ -n "$REGISTRY_URL" ] && [ -n "$REGISTRY_USER" ] && [ -n "$REGISTRY_PASSWORD" ]; then
  echo "Logging into container registry"
  echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_URL" -u "$REGISTRY_USER" --password-stdin
fi

export IMAGE_TAG="$IMAGE_TAG"
if [ -n "$API_IMAGE" ]; then
  export API_IMAGE="$API_IMAGE"
fi
if [ -n "$WEB_IMAGE" ]; then
  export WEB_IMAGE="$WEB_IMAGE"
fi
echo "Using image tag: $IMAGE_TAG"

echo "Pulling latest images (if any are registry-backed)"
# Pull may be a no-op for services that only use local build blocks.
sh -c "$COMPOSE_CMD pull --ignore-pull-failures" || true

if [ "$BUILD_ON_VPS" = "1" ]; then
  echo "Deploying with local image builds (BUILD_ON_VPS=1)"
  sh -c "$COMPOSE_CMD up -d --build --remove-orphans"
else
  echo "Deploying without local builds (BUILD_ON_VPS=0)"
  sh -c "$COMPOSE_CMD up -d --remove-orphans"
fi

if [ "$PRUNE_AFTER_DEPLOY" = "1" ]; then
  echo "Pruning dangling images (PRUNE_AFTER_DEPLOY=1)"
  docker image prune -f
fi
EOF_REMOTE
