#!/bin/bash

# Script to set up the development environment for Connectaball

echo "Setting up Connectaball development environment..."

# Check if docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "Error: Docker is not installed." >&2
  exit 1
fi

# Check if pnpm is installed
if ! [ -x "$(command -v pnpm)" ]; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi

echo "Installing dependencies..."
pnpm install

echo "Building packages..."
pnpm build

echo "Starting services with Docker Compose..."
docker compose up -d

echo "Waiting for PostgreSQL to be ready..."
sleep 10

echo "Seeding database..."
docker compose run --rm db-seed

echo "Development environment is ready!"
echo "PostgreSQL is running on localhost:5432"
echo "Redis is running on localhost:6379"

echo ""
echo "To view the database status:"
echo "  docker compose exec postgres psql -U postgres -d connectaball_dev -c \"SELECT COUNT(*) FROM players;\""
echo ""
echo "To stop the services:"
echo "  docker compose down"
