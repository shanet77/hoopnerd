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

cd "${DEPLOY_TARGET_PATH}"

if [ -d .git ]; then
  echo "Deploy context: user=$(whoami) path=$(pwd)"
  git fetch --all --prune
  git checkout -f main || git checkout -B main origin/main
  # Ensure deploys are reproducible even if tracked files were edited on-host.
  # This does not remove untracked files like .env.prod or Caddyfile.
  git reset --hard origin/main
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

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  pull api web

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  up -d --remove-orphans

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  ps
