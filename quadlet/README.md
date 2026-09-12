# Podman Quadlets for HoopNerd

Rootless, systemd-native container management. Replaces docker-compose.

**Podman version:** 4.9.3+ (Ubuntu 24.04). Some newer quadlet keys (`Expose=`,
`SecurityOpt=`, `NetworkAlias=`) are not available — we use `PodmanArgs=` as a
fallback for those.

## Directory layout

```
quadlet/
├── dev/          # Local dev (postgres + db-seed)
├── prod/         # Production stack (postgres, api, web, db-seed)
├── retired/      # Decommissioned units (old per-site caddy file-servers)
└── README.md
```

## Important notes for podman 4.9.x

- **Networks** are created manually (`podman network create`), not via `.network`
  quadlet files (those create names with a `systemd-` prefix that breaks
  `Network=` references).
- **systemctl enable** does NOT work on quadlet-generated units. Auto-start on
  boot is handled by `[Install] WantedBy=default.target` in each `.container`
  file.
- **`ip_unprivileged_port_start=80`** is required for rootless podman to bind
  to ports 80/443:
  ```bash
  sudo sysctl net.ipv4.ip_unprivileged_port_start=80
  echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-podman-ports.conf
  ```
- **Rootless podman** cannot access files owned by other users (even if group
  permissions allow it). Static sites live in `/home/USER/sites/` owned by
  the `<deploy-user>` user.

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
systemctl --user start hn-dev-postgres.service
systemctl --user stop hn-dev-postgres.service
systemctl --user status hn-dev-postgres.service
podman logs hoopnerd-postgres-dev
```

## Production (VPS)

Deployment is handled by CI (`.forgejo/workflows/deploy.yml`) which runs
`scripts/deploy-quadlet.sh` on the VPS.

### First-time VPS setup
```bash
# 1. Install podman
sudo apt install -y podman

# 2. Allow binding to low ports
sudo sysctl net.ipv4.ip_unprivileged_port_start=80
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-podman-ports.conf

# 3. Enable user lingering (services survive logout)
loginctl enable-linger <deploy-user>

# 4. Clone repo and run deploy
git clone <repo> ~/project/hoopnerd
cd ~/project/hoopnerd
# Then run the deploy script or trigger via CI
```

### Manual deployment
```bash
export IMAGE_TAG=<git-sha>
export REGISTRY_URL=<registry-host>
export REGISTRY_USERNAME=<registry-user>
export REGISTRY_PASSWORD_B64=$(printf 'password' | base64)
export REGISTRY_NAMESPACE=<registry-namespace>
export DEPLOY_PATH=/home/USER/project/hoopnerd

./scripts/deploy-quadlet.sh
```

## Service management

```bash
# View all services
systemctl --user status 'hoopnerd-*' steam2-goaccess.service

# Restart a service
systemctl --user restart hoopnerd-api.service

# View logs
journalctl --user -u hoopnerd-api.service -f
podman logs hoopnerd-api

# Stop everything
# Stop everything (edge proxy is deployed separately from the edge-proxy repo)
systemctl --user stop hoopnerd-web.service hoopnerd-api.service hoopnerd-postgres.service

# Run database seed
systemctl --user start hoopnerd-db-seed.service

# Check containers
podman ps --filter name=hoopnerd
podman ps --filter name=steam2-goaccess
```

## Architecture

Each `.container` file becomes a systemd user unit via podman's quadlet generator.
Containers are managed natively by systemd — auto-restart on failure, auto-start
on boot, unified logging via journald.

| Service | Network(s) | Ports | Notes |
|---------|-----------|-------|-------|
| hoopnerd-postgres | `hoopnerd-internal` | — | Network alias `postgres` for docker-compose compat |
| hoopnerd-api | `hoopnerd-edge`, `hoopnerd-internal` | — | Network alias `api`, read-only rootfs |
| hoopnerd-web | `hoopnerd-edge` | — | Network alias `web`, read-only rootfs |
| hoopnerd-db-seed | `hoopnerd-internal` | — | Type=oneshot, runs once per deploy |
