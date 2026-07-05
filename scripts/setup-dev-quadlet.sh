#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# setup-dev-quadlet.sh — Set up HoopNerd dev environment using Podman Quadlets
#
# Run from the repo root. Sets up postgres + db-seed for local development.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

QUADLET_DIR="${HOME}/.config/containers/systemd"
QUADLET_SRC="${PROJECT_ROOT}/quadlet/dev"

echo "=== HoopNerd Dev Quadlet Setup ==="
echo "Project root: ${PROJECT_ROOT}"
echo "Quadlet dir:  ${QUADLET_DIR}"

if ! command -v podman &>/dev/null; then
  echo "ERROR: podman not found. Install it: https://podman.io/docs/installation"
  exit 1
fi

# Symlink quadlet files
mkdir -p "${QUADLET_DIR}"
echo ""
echo "Linking quadlet files..."
for quadlet_file in "${QUADLET_SRC}"/*.{container,network,volume}; do
  [ -f "${quadlet_file}" ] || continue
  unit_name="$(basename "${quadlet_file}")"
  target="${QUADLET_DIR}/${unit_name}"

  if [ -L "${target}" ] && [ "$(readlink "${target}")" = "${quadlet_file}" ]; then
    echo "  ${unit_name}  (already linked)"
    continue
  fi
  rm -f "${target}"
  ln -s "${quadlet_file}" "${target}"
  echo "  ${unit_name}  -> ${quadlet_file}"
done

# Build db-seed image
echo ""
echo "Building db-seed image..."
podman build \
  --file packages/database/Dockerfile.seed \
  --tag localhost/hoopnerd-db-seed-dev:local \
  "${PROJECT_ROOT}"

# Reload systemd
echo ""
echo "Reloading systemd user units..."
systemctl --user daemon-reload

# Start postgres
echo ""
echo "Starting PostgreSQL..."
systemctl --user enable --now hn-dev-postgres.service

# Wait for healthy postgres
echo "Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 30); do
  if podman exec hoopnerd-postgres-dev pg_isready -U postgres &>/dev/null; then
    echo "PostgreSQL is ready."
    break
  fi
  sleep 1
done

# Run seed
echo ""
echo "Running database seed..."
systemctl --user start hn-dev-db-seed.service || {
  echo "Seed completed (non-zero exit may be expected if already seeded)."
  podman logs hoopnerd-db-seed-dev 2>&1 | tail -20 || true
}

echo ""
echo "=== Dev setup complete ==="
echo "PostgreSQL running on localhost:5432"
echo "  Database: connectaball_dev"
echo "  User:     postgres"
echo "  Password: postgres"
echo ""
echo "Management commands:"
echo "  systemctl --user status hn-dev-postgres.service"
echo "  systemctl --user stop hn-dev-postgres.service"
echo "  systemctl --user start hn-dev-postgres.service"
echo "  podman logs hoopnerd-postgres-dev"
