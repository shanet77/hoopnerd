# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

# Build-time version metadata — declare globally so all stages see them
ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_TIME

FROM node:${NODE_VERSION}-slim AS base

# The web Dockerfile is copy-pasted into our main docs at /docs/handbook/deploying-with-docker.
# Make sure you update this Dockerfile, the Dockerfile in the web workspace and copy that over to Dockerfile in the docs.

# Shared toolchain for all stages
# corepack picks up the pnpm version from packageManager in package.json
RUN corepack enable && npm i -g turbo

FROM base AS prepare
WORKDIR /app
COPY . .
RUN turbo prune api --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS builder
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,target=/pnpm/store pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

# Build the project and its dependencies
COPY --from=prepare /app/out/full/ .

# Uncomment and use build args to enable remote caching
# ARG TURBO_TEAM
# ENV TURBO_TEAM=$TURBO_TEAM

# ARG TURBO_TOKEN
# ENV TURBO_TOKEN=$TURBO_TOKEN

RUN pnpm turbo run build --filter=api...

# Bundle api + prod-only deps into a self-contained deploy directory.
# --prod excludes devDependencies (jest, eslint, typescript, nodemon, ...).
# --legacy: pnpm v10+ default requires inject-workspace-packages=true; the
# legacy deploy path produces a portable, self-contained node_modules bundle.
RUN pnpm --filter=api deploy --prod --legacy /app/deploy

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Re-declare build args for the runner stage (fresh image doesn't inherit from base)
ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_TIME
ENV APP_VERSION=${APP_VERSION:-unknown}
ENV GIT_SHA=${GIT_SHA:-unknown}
ENV BUILD_TIME=${BUILD_TIME:-unknown}

# Don't run production as root
RUN addgroup --system --gid 1001 expressjs
RUN adduser --system --uid 1001 expressjs
USER expressjs
COPY --from=builder --chown=expressjs:expressjs /app/deploy ./

CMD ["node", "dist/index.js"]
