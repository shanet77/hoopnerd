# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

# The web Dockerfile is copy-pasted into our main docs at /docs/handbook/deploying-with-docker.
# Make sure you update this Dockerfile, the Dockerfile in the web workspace and copy that over to Dockerfile in the docs.

# Shared toolchain for all stages
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate && npm i -g turbo

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

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 expressjs
RUN adduser --system --uid 1001 expressjs
USER expressjs
COPY --from=builder /app .

CMD node apps/api/dist/index.js
