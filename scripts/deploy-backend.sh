#!/usr/bin/env bash
set -euo pipefail
ENVIRONMENT=${1:-staging}
COMPOSE_FILE="infrastructure/docker-compose.yml"
ENV_FILE="infrastructure/docker-compose.${ENVIRONMENT}.yml"
echo "Deploying backend to ${ENVIRONMENT}..."
git pull origin main
docker-compose -f ${COMPOSE_FILE} -f ${ENV_FILE} build
docker-compose -f ${COMPOSE_FILE} -f ${ENV_FILE} down --timeout 30
docker-compose -f ${COMPOSE_FILE} -f ${ENV_FILE} up -d
./scripts/health-check.sh
echo "✓ Deployment complete"
