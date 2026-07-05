Podman Quadlet files for HoopNerd — rootless, systemd-native container management.

## Directory layout

```
quadlet/
├── dev/          # Local dev environment (postgres + db-seed)
├── prod/         # Production stack (postgres, api, web, caddy, db-seed)
└── README.md
```

## Dev (local development)

One-time setup:
```bash
./scripts/setup-dev-quadlet.sh
```

This builds the db-seed image, links the dev quadlet files to
`~/.config/containers/systemd/`, starts postgres on `localhost:5432`,
and runs the seed.

Daily use:
```bash
systemctl --user start hn-dev-postgres.service    # start (auto-starts on boot if enabled)
systemctl --user stop hn-dev-postgres.service     # stop
systemctl --user status hn-dev-postgres.service   # check status
podman logs hoopnerd-postgres-dev                 # view logs
podman exec -it hoopnerd-postgres-dev psql -U postgres -d connectaball_dev  # psql shell
```

Seeded again after schema changes:
```bash
systemctl --user start hn-dev-db-seed.service
```

## Production (VPS)

Deployment is handled by the CI pipeline (`.forgejo/workflows/deploy.yml`) which
runs `scripts/deploy-quadlet.sh` on the target VPS.

Manual deployment (from VPS, with repo cloned at `/home/USER/project/hoopnerd`):
```bash
export IMAGE_TAG=<git-sha>
export REGISTRY_URL=zot.example.com
export REGISTRY_USERNAME=<registry-user>
export REGISTRY_PASSWORD_B64=$(printf 'password' | base64)
export REGISTRY_NAMESPACE=<registry-namespace>
export DEPLOY_PATH=/home/USER/project/hoopnerd

./scripts/deploy-quadlet.sh
```

The script:
1. Logs into the container registry with podman
2. Pulls the specified SHA-tagged images and retags them as `main-latest`
3. Builds the `db-seed` image from `packages/database/Dockerfile.seed`
4. Symlinks quadlet files from `quadlet/prod/` to `~/.config/containers/systemd/`
5. Runs `systemctl --user daemon-reload`
6. Runs db-seed (one-shot)
7. Restarts all services
8. Verifies running containers match the expected image digests

## Service management (prod)

```bash
# View all services
systemctl --user status 'hoopnerd-*'

# Restart a single service
systemctl --user restart hoopnerd-api.service

# View logs
journalctl --user -u hoopnerd-api.service -f
podman logs hoopnerd-api

# Stop everything
systemctl --user stop hoopnerd-caddy.service hoopnerd-web.service hoopnerd-api.service hoopnerd-postgres.service

# Enable auto-start on boot
systemctl --user enable hoopnerd-postgres.service hoopnerd-api.service hoopnerd-web.service hoopnerd-caddy.service

# Run database seed (after schema changes)
systemctl --user start hoopnerd-db-seed.service

# Check container status
podman ps --filter name=hoopnerd
```

## How it works

Each `.container` file becomes a systemd user unit. Podman's `quadlet` generator
converts them at `daemon-reload` time. The result: containers are managed
natively by systemd — auto-restart on failure, auto-start on boot, unified logging
via journald.

- **Networks** (`hoopnerd-edge`, `hoopnerd-internal`) are defined in `.network` files
- **Volumes** are defined in `.volume` files and auto-created on first use
- **Dependencies** (`Requires=`, `After=`) order startup: postgres → api → web → caddy
- **One-shot containers** (db-seed) use `Type=oneshot` and `RemainAfterExit=no`

No Docker daemon, no docker-compose. Just podman + systemd.
