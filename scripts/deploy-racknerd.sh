#!/usr/bin/env bash
set -euo pipefail

DEPLOY_TARGET_PATH="${DEPLOY_PATH:-${PATH_ON_VPS:-}}"
: "${DEPLOY_TARGET_PATH:?DEPLOY_PATH or PATH_ON_VPS is required}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY_URL="${REGISTRY_URL:-}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"
REGISTRY_NAMESPACE="${REGISTRY_NAMESPACE:-}"
API_IMAGE="${API_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"

echo "=== deploy-racknerd starting ==="
echo "user=$(whoami) target_path=${DEPLOY_TARGET_PATH} image_tag=${IMAGE_TAG}"

# Ensure deploy directory exists
if [ ! -d "${DEPLOY_TARGET_PATH}" ]; then
  echo "ERROR: Deploy path ${DEPLOY_TARGET_PATH} does not exist"
  echo "Create it and clone the repo first:"
  echo "  mkdir -p ${DEPLOY_TARGET_PATH}"
  echo "  git clone <repo-url> ${DEPLOY_TARGET_PATH}"
  exit 1
fi

cd "${DEPLOY_TARGET_PATH}"

if [ -d .git ]; then
  echo "Pulling latest main..."
  git remote prune origin || true
  git fetch origin main
  git checkout -f main || git checkout -B main origin/main
  git reset --hard origin/main
  echo "Deploying commit: $(git rev-parse HEAD)"
else
  echo "ERROR: ${DEPLOY_TARGET_PATH} is not a git repository"
  exit 1
fi

# Verify required files exist
if [ ! -f docker-compose.prod.yml ]; then
  echo "ERROR: docker-compose.prod.yml not found in ${DEPLOY_TARGET_PATH}"
  exit 1
fi
if [ ! -f .env.prod ]; then
  echo "ERROR: .env.prod not found in ${DEPLOY_TARGET_PATH}"
  exit 1
fi

REGISTRY_HOST="${REGISTRY_URL#https://}"
REGISTRY_HOST="${REGISTRY_HOST#http://}"
REGISTRY_HOST="${REGISTRY_HOST%%/*}"
REGISTRY_HOST="${REGISTRY_HOST%/}"

if [ -n "${REGISTRY_HOST}" ] && [ -n "${REGISTRY_USERNAME}" ] && [ -n "${REGISTRY_PASSWORD}" ]; then
  echo "Logging into ${REGISTRY_HOST}"
  echo "${REGISTRY_PASSWORD}" | docker login "${REGISTRY_HOST}" -u "${REGISTRY_USERNAME}" --password-stdin
fi

if [ -z "${API_IMAGE}" ] && [ -n "${REGISTRY_HOST}" ] && [ -n "${REGISTRY_NAMESPACE}" ]; then
  API_IMAGE="${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/hoopnerd-api:${IMAGE_TAG}"
fi

if [ -z "${WEB_IMAGE}" ] && [ -n "${REGISTRY_HOST}" ] && [ -n "${REGISTRY_NAMESPACE}" ]; then
  WEB_IMAGE="${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/hoopnerd-web:${IMAGE_TAG}"
fi

: "${API_IMAGE:?API_IMAGE is required. Set API_IMAGE or REGISTRY_URL+REGISTRY_NAMESPACE+IMAGE_TAG.}"
: "${WEB_IMAGE:?WEB_IMAGE is required. Set WEB_IMAGE or REGISTRY_URL+REGISTRY_NAMESPACE+IMAGE_TAG.}"

export API_IMAGE
export WEB_IMAGE
export IMAGE_TAG

# Run database migration + seed (seed skips if data already exists)
echo "Ensuring database schema and seed data..."
docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  --profile seed \
  run --rm db-seed

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  pull api web

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  up -d --remove-orphans --force-recreate

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  ps
