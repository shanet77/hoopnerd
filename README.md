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
│   ├── logic/                     # Shared game validator
│   └── config/                    # Shared eslint/tsconfig
├── scripts/                       # Optional: CI/CD or database migration scripts
├── .dockerignore                  # Prevents sending node_modules to Docker daemon
├── Caddyfile                      # Reverse proxy configuration
├── docker-compose.yaml            # Local & VPS orchestration
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
└── AGENTS.md


### Apps and Packages

- `web`: a [Next.js](https://nextjs.org/) app
- `api`: an [Express](https://expressjs.com/) server
- `@repo/ui`: a React component library
- `@repo/logger`: Isomorphic logger (a small wrapper around console.log)
- `@repo/eslint-config`: ESLint presets
- `@repo/typescript-config`: tsconfig.json's used throughout the monorepo
- `@repo/jest-presets`: Jest configurations

