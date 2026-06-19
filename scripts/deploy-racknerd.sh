#!/usr/bin/env bash
set -euo pipefail

DEPLOY_TARGET_PATH="${DEPLOY_PATH:-${PATH_ON_VPS:-}}"
: "${DEPLOY_TARGET_PATH:?DEPLOY_PATH or PATH_ON_VPS is required}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY_URL="${REGISTRY_URL:-}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD_B64="${REGISTRY_PASSWORD_B64:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"
REGISTRY_NAMESPACE="${REGISTRY_NAMESPACE:-}"
API_IMAGE="${API_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"

# Decode base64 password if provided (CI sends it base64-encoded for shell safety)
if [ -n "${REGISTRY_PASSWORD_B64}" ] && [ -z "${REGISTRY_PASSWORD}" ]; then
  REGISTRY_PASSWORD="$(printf '%s' "${REGISTRY_PASSWORD_B64}" | base64 -d)"
fi

echo "=== deploy-racknerd starting ==="
echo "user=$(whoami) target_path=${DEPLOY_TARGET_PATH} image_tag=${IMAGE_TAG} app_version=${APP_VERSION:-unknown}"

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
  if git fetch --tags origin main 2>&1; then
    git checkout -f main || git checkout -B main origin/main
    git reset --hard origin/main
    echo "Deploying commit: $(git rev-parse HEAD)"
  else
    echo "WARNING: git fetch failed. Proceeding with existing checkout for config files."
  fi
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
  if echo "${REGISTRY_PASSWORD}" | docker login "${REGISTRY_HOST}" -u "${REGISTRY_USERNAME}" --password-stdin 2>&1; then
    echo "Registry login successful"
  else
    echo "WARNING: Registry login failed. Continuing with existing credentials if available."
  fi
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

echo "Using API_IMAGE=${API_IMAGE}"
echo "Using WEB_IMAGE=${WEB_IMAGE}"

# Run database migration + seed (seed skips if data already exists)
echo "Ensuring database schema and seed data..."
docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  --profile seed \
  run --rm db-seed

echo "Pulling images..."
docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  pull api web

echo "Deploying containers..."
docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  up -d --remove-orphans --force-recreate

echo "Verifying deployed containers run the expected images..."
verify_service_image() {
  local service="$1" expected_image="$2"
  local container running_status running_image expected_image_id
  container="$(docker compose -f docker-compose.prod.yml --env-file .env.prod ps -q "${service}")" || container=""
  if [ -z "${container}" ]; then
    echo "ERROR: no container exists for service '${service}' after deploy" >&2
    return 1
  fi
  running_status="$(docker inspect "${container}" --format '{{.State.Status}}')" || running_status="unknown"
  running_image="$(docker inspect "${container}" --format '{{.Image}}')" || running_image=""
  expected_image_id="$(docker image inspect "${expected_image}" --format '{{.Id}}')" || expected_image_id=""
  if [ "${running_status}" != "running" ]; then
    echo "ERROR: service '${service}' is not running (status='${running_status}')" >&2
    return 1
  fi
  if [ -z "${expected_image_id}" ]; then
    echo "ERROR: expected image '${expected_image}' is not present locally; was it pulled?" >&2
    return 1
  fi
  if [ "${running_image}" != "${expected_image_id}" ]; then
    echo "ERROR: service '${service}' is running image ${running_image}" >&2
    echo "       but expected ${expected_image_id} (${expected_image})." >&2
    echo "       The new image was NOT rolled out — refusing to report success." >&2
    return 1
  fi
  echo "OK: service '${service}' is running expected image (${expected_image})."
  return 0
}

VERIFY_FAILED=0
verify_service_image api "${API_IMAGE}" || VERIFY_FAILED=1
verify_service_image web "${WEB_IMAGE}" || VERIFY_FAILED=1

if [ "${VERIFY_FAILED}" = "1" ]; then
  echo "=== DEPLOY VERIFICATION FAILED: deployed images do not match expected ===" >&2
  docker compose -f docker-compose.prod.yml --env-file .env.prod ps >&2 || true
  exit 1
fi

# Update local main-latest tags to point to the newly deployed images
# This ensures future default-tag deploys use the latest
echo "Updating local main-latest tags..."
API_LATEST="$(echo "${API_IMAGE}" | cut -d: -f1):main-latest"
WEB_LATEST="$(echo "${WEB_IMAGE}" | cut -d: -f1):main-latest"
docker tag "${API_IMAGE}" "${API_LATEST}" 2>/dev/null || true
docker tag "${WEB_IMAGE}" "${WEB_LATEST}" 2>/dev/null || true

docker compose \
  -f docker-compose.prod.yml \
  --env-file .env.prod \
  ps
