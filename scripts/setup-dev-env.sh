#!/bin/bash
set -euo pipefail

# Script to set up the development environment for hoopnerd

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="docker-compose.dev.yml"

echo "============================================"
echo "  hoopnerd — Development Environment Setup"
echo "============================================"
echo ""

# Check if docker is installed
if ! command -v docker &>/dev/null; then
  echo "❌ Error: Docker is not installed." >&2
  exit 1
fi

# Check if Docker Compose is available (plugin or standalone)
if ! docker compose version &>/dev/null && ! docker-compose --version &>/dev/null; then
  echo "❌ Error: Docker Compose is not installed." >&2
  exit 1
fi

# ── Corepack / pnpm ───────────────────────────────────────────────────────

echo "▸ Enforcing pnpm version via corepack..."
export COREPACK_ENABLE_STRICT=1

# corepack is bundled with Node.js 16.9+, but may need to be enabled first
if ! command -v corepack &>/dev/null; then
  echo "⚠️  corepack is not available. Run 'npm install -g corepack' manually." >&2
  echo "   Falling back to npm-based pnpm install..."
  if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm
  fi
else
  corepack enable
fi

# Verify the pinned pnpm version (from packageManager) is active
EXPECTED_PNPM="12.6.0"
ACTUAL_PNPM="$(pnpm --version 2>/dev/null || true)"
if [ "$ACTUAL_PNPM" != "$EXPECTED_PNPM" ]; then
  echo "⚠️  Expected pnpm v$EXPECTED_PNPM but found v${ACTUAL_PNPM:-<none>}. Continuing anyway..."
else
  echo "   pnpm v$ACTUAL_PNPM ✓"
fi

# ── .env file ─────────────────────────────────────────────────────────────

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "▸ Creating .env file with sensible defaults..."
  cat > "$PROJECT_DIR/.env" <<-EOF
# hoopnerd — Local development environment
# You can override any of these values as needed.

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/connectaball_dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=connectaball_dev
DB_USER=postgres
DB_PASSWORD=postgres
EOF
  echo "   Created $PROJECT_DIR/.env"
else
  echo "▸ .env file already exists, skipping..."
fi

# ── Install dependencies ──────────────────────────────────────────────────

echo ""
echo "▸ Installing dependencies..."
cd "$PROJECT_DIR"
pnpm install

# Approve build scripts for native dependencies
# (pnpm 11+ blocks these by default)
echo "▸ Approving build scripts for native packages..."
pnpm approve-builds --all 2>/dev/null || true

# ── Stop local PostgreSQL if running (conflicts with Docker) ──────────────

if command -v brew &>/dev/null && brew services list 2>/dev/null | grep -qE 'postgresql.*started'; then
  echo "▸ Stopping local PostgreSQL (conflicts with Docker on port 5432)..."
  brew services stop postgresql@14 2>/dev/null || brew services stop postgresql 2>/dev/null || true
fi

# ── Start Docker Compose services ─────────────────────────────────────────

echo ""
echo "▸ Starting services with Docker Compose (-f $COMPOSE_FILE)..."
docker compose -f "$COMPOSE_FILE" up -d

# ── Wait for PostgreSQL to become healthy ─────────────────────────────────

echo ""
echo "▸ Waiting for PostgreSQL to become healthy..."
MAX_RETRIES=30
RETRY_INTERVAL=2
RETRIES=0

while true; do
  HEALTH=$(docker compose -f "$COMPOSE_FILE" ps --format json postgres 2>/dev/null || true)
  HEALTH_STATUS=$(echo "$HEALTH" | grep -o '"Health":"[^"]*"' | cut -d'"' -f4 || true)

  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "   PostgreSQL is healthy ✓"
    break
  fi

  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "❌ Error: PostgreSQL did not become healthy within $((MAX_RETRIES * RETRY_INTERVAL))s." >&2
    echo "   Check logs with: docker compose -f $COMPOSE_FILE logs postgres" >&2
    exit 1
  fi

  # Show progress every ~10s
  if [ $((RETRIES % 5)) -eq 0 ]; then
    echo "   Still waiting... (${RETRIES}s)"
  fi

  sleep "$RETRY_INTERVAL"
done

# ── Seed the database ─────────────────────────────────────────────────────

echo ""
echo "▸ Seeding database..."
SEED_EXIT_CODE=0
docker compose -f "$COMPOSE_FILE" run --rm db-seed || SEED_EXIT_CODE=$?

if [ "$SEED_EXIT_CODE" -ne 0 ]; then
  echo "❌ Error: Database seed failed (exit code $SEED_EXIT_CODE)." >&2
  echo "   Check logs with: docker compose -f $COMPOSE_FILE logs db-seed" >&2
  exit 1
fi

echo "   Database seeded successfully ✓"

# ── Start dev servers on host ─────────────────────────────────────────────

DEV_LOG="$PROJECT_DIR/.tmp/dev-server.log"
mkdir -p "$PROJECT_DIR/.tmp"

echo ""
echo "▸ Starting web (localhost:3000) and API (localhost:3001) servers..."
cd "$PROJECT_DIR"

# Use nohup + disown to fully detach from the shell so the processes
# survive after this script exits.
nohup pnpm dev > "$DEV_LOG" 2>&1 &
DEV_PID=$!
disown

# Wait up to 30s for the servers to start
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '' http://localhost:3001 2>/dev/null; then
    break
  fi
  sleep 1
done

# ── Summary ───────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Development environment is ready! 🏀"
echo "============================================"
echo ""
echo "  ▶  Web:   http://localhost:3000"
echo "  ▶  API:   http://localhost:3001"
echo "  ▶  PostgreSQL:  localhost:5432"
echo ""
echo "  Quick commands:"
echo "    Check DB status:"
echo "      docker compose -f $COMPOSE_FILE exec postgres psql -U postgres -d connectaball_dev -c \"SELECT COUNT(*) FROM players;\""
echo ""
echo "    View dev server logs:"
echo "      tail -f $DEV_LOG"
echo ""
echo "    View DB logs:"
echo "      docker compose -f $COMPOSE_FILE logs -f"
echo ""
echo "    Stop everything:"
echo "      kill $DEV_PID 2>/dev/null; docker compose -f $COMPOSE_FILE down"
echo ""
