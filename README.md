# HoopNerd
A real-time, multiplayer basketball trivia game where players connect athletes based on shared team-seasons.

## High-Level Architecture
- **Monorepo:** Managed via Turborepo.
- **Frontend (`apps/web`):** Next.js (App Router), Tailwind CSS, Socket.io-client.
- **Backend (`apps/server`):** Node.js/Express, Socket.io, PostgreSQL.
- **Shared (`packages/types`):** Single source of truth for TypeScript interfaces.

## Key Logic & Domain Concepts
1. **The Graph:** Players are nodes. A "shared season" (same team, same year) is the edge.
2. **Move Validation:** Must happen server-side. A move is valid if `Player B` played with `Player A` in any year.
3. **No Auth:** Games are session-based. Multiplayer uses unique Room IDs in the URL.
4. **No Coaches:** The current scope is strictly NBA players.
5. **Persistence:** In-progress rooms and solo runs are snapshotted to Postgres
   (`active_games`) and rehydrated on API startup, so a deploy or restart does
   not end active games. Idle lobbies expire after `ROOM_IDLE_TTL_MS` (2h) and
   idle solo runs after `SOLO_RUN_IDLE_TTL_MS` (2h).

## Database Schema
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    abbreviation CHAR(3) UNIQUE -- Useful for searching/filtering (e.g., 'LAL', 'GSW')
);

CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    player_name VARCHAR(150) NOT NULL,
    -- Using a flat string for now, but consider an ENUM later
    position VARCHAR(50), 
);

CREATE TABLE rosters (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    season_year INTEGER NOT NULL, -- e.g., 2024 for the 2023-24 season
    
    PRIMARY KEY (player_id, team_id, season_year)
);

## Tech Stack Guidelines
- **Strict Typing:** Always use the shared `@repo/types` for WebSocket events.
- **State:** Server is the source of truth for game state (timers, move history).
- **Communication:** Use WebSockets for real-time play; REST for initial data/search.

## Development Commands
- `pnpm dev`: Starts both frontend and backend in parallel.
- `pnpm build`: Builds all apps and shared packages.
- `pnpm lint`: Runs linting across the entire monorepo.

## Local Development

Requires Docker (for Postgres) and pnpm.

```sh
# 1. Start Postgres and seed it (first run only for the seed step)
docker compose -f docker-compose.dev.yml up postgres -d
docker compose -f docker-compose.dev.yml run --rm --build db-seed

# 2. Start the API (:3001) and web app (:3000)
# NEXT_PUBLIC_EMBED_PARENT_ORIGINS lets the /embed/cpu route notify
# a locally-running parent page (see example.com /play docs).
NEXT_PUBLIC_EMBED_PARENT_ORIGINS=http://localhost:4321 pnpm dev
```

- Lobby: <http://localhost:3000>
- Frameless CPU game (what example.com embeds): <http://localhost:3000/embed/cpu>
- API health: <http://localhost:3001/health>
- The embed accepts `?name=` and `?min=`/`?max=` season filters, e.g.
  `/embed/cpu?name=Shane&min=1996&max=1998`. Names are capped at 32 chars
  and seasons are clamped to the seeded range; invalid values fall back
  to a guest name / All Time.

No CORS configuration is needed locally: outside production the API
allows all origins (see `buildAllowedOrigins` in
`apps/api/src/serverUtils.ts`).

## Forgejo CI/CD (Actions)
- Workflow: `.forgejo/workflows/deploy.yml`
- Deployment helper (executed on Racknerd via SSH): `scripts/deploy-quadlet.sh`
- Container orchestration: [Podman Quadlets](quadlet/) (replaces docker-compose)

### Required Forgejo Actions Secrets
- `DEPLOY_HOST` (Racknerd host/IP)
- `DEPLOY_USER` (example: `<deploy-user>`)
- `DEPLOY_SSH_KEY` (private key with access to `DEPLOY_USER@DEPLOY_HOST`)
- `DEPLOY_PATH` (preferred) or `PATH_ON_VPS` (legacy alias)
- `DOCKERNODE_HOST`
- `DOCKERNODE_USER`
- `DOCKERNODE_SSH_KEY`
- `DOCKERNODE_PATH`
- `REGISTRY_URL` (registry host, stored as a CI secret)
- `REGISTRY_USERNAME`
- `REGISTRY_PASSWORD`

### Secrets/Vars for Image Namespace
- `REGISTRY_NAMESPACE` can be provided as either:
  - Forgejo Secret: `REGISTRY_NAMESPACE`
  - Forgejo Variable (`vars`): `REGISTRY_NAMESPACE`

### Optional Forgejo Actions Variables (repo/org `vars`)
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_HOST`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID`

### Deployment Behavior
- Pull requests run `test`.
- Push to `main` builds `api` and `web` Docker images on `dockernode` and pushes them to `zot`.
- Racknerd deploy then pulls tagged images from the registry and restarts services via Podman Quadlets (systemd units). No docker-compose on the VPS.
- The Caddy reverse proxy lives in the separate `edge-proxy` repo; this deploy never touches it.
- `workflow_dispatch` supports optional `image_tag` to redeploy an existing tag without rebuilding.

## Boundaries
- Never modify the database schema without updating `@repo/types`.
- Avoid hardcoding player data; everything must be queried from the `db` package.

## Directory Structure
Connectaball/
├── apps/
│   ├── web/
│   │   ├── Dockerfile             # Multi-stage build for Next.js
│   │   ├── next.config.js
│   │   └── src/
│   └── server/
│       ├── Dockerfile             # Multi-stage build for Node/Express
│       └── src/
├── packages/
│   ├── database/                  # seed scripts for postgres
│   ├── types/                     # Shared TS interfaces
│   ├── ui/                        # Shared React components
│   └── typescript-config/         # Shared tsconfig presets
├── scripts/                       # Optional: CI/CD or database migration scripts
├── .dockerignore                  # Prevents sending node_modules to Docker daemon
├── quadlet/                        # Podman Quadlet unit files (postgres, api, web, db-seed; edge proxy lives in edge-proxy)
├── docker-compose.yaml            # Local & VPS orchestration (legacy — see quadlet/)
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
└── AGENTS.md


### Apps and Packages

- `web`: a [Next.js](https://nextjs.org/) app
- `api`: an [Express](https://expressjs.com/) server
- `@repo/ui`: a React component library
- `@repo/typescript-config`: tsconfig.json's used throughout the monorepo
