#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# deploy-quadlet.sh — Deploy HoopNerd via Podman Quadlets
#
# Replaces docker-compose.prod.yml + docker compose up with Podman Quadlet
# systemd units. Designed to run on the target VPS.
#
# Environment variables (same contract as deploy-racknerd.sh):
#   DEPLOY_PATH         Path to cloned repo on VPS  (required)
#   IMAGE_TAG           Git SHA / tag for images     (required)
#   APP_VERSION         Semver version string        (optional)
#   REGISTRY_URL        Container registry URL       (required)
#   REGISTRY_USERNAME   Registry login user          (required)
#   REGISTRY_PASSWORD_B64  Base64-encoded password   (required)
#   REGISTRY_NAMESPACE  Registry project namespace   (required)
# =============================================================================

echo "=== deploy-quadlet starting ==="
echo "user=$(whoami) host=$(hostname) ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) pid=$$"
echo "image_tag=${IMAGE_TAG:-UNSET} app_version=${APP_VERSION:-unknown}"

DEPLOY_TARGET_PATH="${DEPLOY_PATH:-}"
: "${DEPLOY_TARGET_PATH:?DEPLOY_PATH is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${REGISTRY_URL:?REGISTRY_URL is required}"
: "${REGISTRY_USERNAME:?REGISTRY_USERNAME is required}"
: "${REGISTRY_PASSWORD_B64:?REGISTRY_PASSWORD_B64 is required}"
: "${REGISTRY_NAMESPACE:?REGISTRY_NAMESPACE is required}"

cd "${DEPLOY_TARGET_PATH}"

# --- ensure podman is available ----------------------------------------------
if ! command -v podman &>/dev/null; then
  echo "ERROR: podman not found on PATH. Install podman first."
  exit 1
fi
echo "podman version: $(podman --version)"

# --- registry login ----------------------------------------------------------
REGISTRY_HOST="${REGISTRY_URL#https://}"
REGISTRY_HOST="${REGISTRY_HOST#http://}"
REGISTRY_HOST="${REGISTRY_HOST%%/*}"
REGISTRY_HOST="${REGISTRY_HOST%/}"

REGISTRY_PASSWORD="$(printf '%s' "${REGISTRY_PASSWORD_B64}" | base64 -d)"
echo "Logging into ${REGISTRY_HOST}..."
if printf '%s' "${REGISTRY_PASSWORD}" | podman login "${REGISTRY_HOST}" -u "${REGISTRY_USERNAME}" --password-stdin; then
  echo "Registry login successful"
else
  echo "ERROR: Registry login failed" >&2
  exit 1
fi

# --- resolve image names -----------------------------------------------------
API_IMAGE_SHA="${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/hoopnerd-api:${IMAGE_TAG}"
WEB_IMAGE_SHA="${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/hoopnerd-web:${IMAGE_TAG}"
API_IMAGE_LATEST="${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/hoopnerd-api:main-latest"
WEB_IMAGE_LATEST="${REGISTRY_HOST}/${REGISTRY_NAMESPACE}/hoopnerd-web:main-latest"

echo "API  sha    : ${API_IMAGE_SHA}"
echo "API  latest : ${API_IMAGE_LATEST}"
echo "WEB  sha    : ${WEB_IMAGE_SHA}"
echo "WEB  latest : ${WEB_IMAGE_LATEST}"

# --- pull images -------------------------------------------------------------
echo "Pulling images..."
podman pull "${API_IMAGE_SHA}"
podman pull "${WEB_IMAGE_SHA}"

# Tag the SHA images as main-latest so the quadlet files pick them up.
# The quadlet files reference the main-latest tag as their Image=.
echo "Tagging SHA images as main-latest..."
podman tag "${API_IMAGE_SHA}" "${API_IMAGE_LATEST}"
podman tag "${WEB_IMAGE_SHA}" "${WEB_IMAGE_LATEST}"

API_IMAGE_ID="$(podman image inspect "${API_IMAGE_SHA}" --format '{{.Id}}')"
WEB_IMAGE_ID="$(podman image inspect "${WEB_IMAGE_SHA}" --format '{{.Id}}')"
echo "API  image ID: ${API_IMAGE_ID}"
echo "WEB  image ID: ${WEB_IMAGE_ID}"

# --- build db-seed image locally ---------------------------------------------
echo "Building db-seed image..."
podman build \
  --file packages/database/Dockerfile.seed \
  --tag localhost/hoopnerd-db-seed:local \
  .

# --- deploy quadlet files ----------------------------------------------------
QUADLET_DIR="${HOME}/.config/containers/systemd"
mkdir -p "${QUADLET_DIR}"

# Link quadlet files so they stay in sync with the repo on subsequent pulls.
# Only link files that aren't already symlinked to the correct target.
echo "Deploying quadlet unit files to ${QUADLET_DIR}..."
for quadlet_file in quadlet/prod/*.{container,network,volume}; do
  [ -f "${quadlet_file}" ] || continue
  unit_name="$(basename "${quadlet_file}")"
  target="${QUADLET_DIR}/${unit_name}"
  src="${DEPLOY_TARGET_PATH}/${quadlet_file}"
  if [ -L "${target}" ] && [ "$(readlink "${target}")" = "${src}" ]; then
    continue  # already correct
  fi
  rm -f "${target}"
  ln -s "${src}" "${target}"
  echo "  ${unit_name}"
done

# --- reload systemd and start/restart services -------------------------------
echo "Reloading systemd user units..."
systemctl --user daemon-reload

# Enable services (they'll auto-start on boot)
systemctl --user enable hoopnerd-postgres.service hoopnerd-api.service hoopnerd-web.service hoopnerd-caddy.service example-site.service

# Run database seed as a one-shot task before starting the app stack.
# The seed container has After=hoopnerd-postgres.service so it will wait.
echo "Running database seed..."
if systemctl --user start hoopnerd-db-seed.service; then
  echo "Database seed completed."
else
  # db-seed exits non-zero if data already exists (prisma migrate dev).
  # This is expected on subsequent deploys. Check container logs for details.
  echo "Database seed finished (non-zero exit may be expected if already seeded)."
  podman logs hoopnerd-db-seed 2>&1 || true
fi

# Start/restart the application stack
echo "Starting/restarting application services..."
systemctl --user restart hoopnerd-postgres.service
sleep 2  # let postgres settle before api connects

systemctl --user restart hoopnerd-api.service hoopnerd-web.service hoopnerd-caddy.service example-site.service

# --- verify deployed containers are running the expected images ---------------
verify_service_image() {
  local service="$1" expected_image_id="$2" label="$3"
  local container running_image
  container="$(podman container inspect "${label}" --format '{{.Id}}' 2>/dev/null)" || container=""
  if [ -z "${container}" ]; then
    echo "ERROR: no container exists for '${label}' after deploy" >&2
    return 1
  fi
  running_image="$(podman container inspect "${label}" --format '{{.Image}}' 2>/dev/null)" || running_image=""
  if [ "${running_image}" != "${expected_image_id}" ]; then
    echo "ERROR: '${label}' is running image ${running_image}" >&2
    echo "       but expected ${expected_image_id}." >&2
    return 1
  fi
  echo "OK: '${label}' is running expected image (${expected_image_id})."
  return 0
}

# Give containers a moment to start
sleep 3

VERIFY_FAILED=0
verify_service_image api "${API_IMAGE_ID}" "hoopnerd-api" || VERIFY_FAILED=1
verify_service_image web "${WEB_IMAGE_ID}" "hoopnerd-web" || VERIFY_FAILED=1

if [ "${VERIFY_FAILED}" = "1" ]; then
  echo "=== DEPLOY VERIFICATION FAILED ===" >&2
  echo "Running containers:" >&2
  podman ps -a --filter name=hoopnerd >&2 || true
  exit 1
fi

echo ""
echo "=== deploy-quadlet complete ==="
echo "Service status:"
systemctl --user status hoopnerd-postgres.service hoopnerd-api.service hoopnerd-web.service hoopnerd-caddy.service example-site.service --no-pager --lines=0 || true

echo ""
echo "Containers:"
podman ps --filter name=hoopnerd
