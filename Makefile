.PHONY: help dev-backend dev-mobile build-backend build-mobile deploy-backend test-backend test-mobile
.DEFAULT_GOAL := help

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev-backend: ## Start backend API (Docker)
	docker-compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml up

dev-mobile: ## Start Expo development server
	cd services/mobile && npm start

build-backend: ## Build backend Docker images
	docker-compose -f infrastructure/docker-compose.yml build

build-mobile: ## Trigger EAS build
	./scripts/build-mobile.sh all production

deploy-backend: ## Deploy backend to production
	./scripts/deploy-backend.sh prod

test-backend: ## Run backend tests
	docker-compose -f infrastructure/docker-compose.yml run --rm backend pytest

test-mobile: ## Run mobile tests
	cd services/mobile && npm test

health: ## Check backend health
	./scripts/health-check.sh

version: ## Show current version
	@git describe --tags --always

release: ## Create new release tag
	./scripts/version-tag.sh
