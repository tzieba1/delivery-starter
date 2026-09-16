# Delivery App - Production-Ready Starter

Mobile-first delivery application with Expo frontend and FastAPI backend.

## Architecture

- **Mobile**: Expo React Native (iOS/Android)
- **Backend**: FastAPI with PostgreSQL
- **Deployment**: Docker (backend), EAS Build (mobile)

## Quick Start

### Backend Development
```bash
make dev-backend
# API at http://localhost:8000
```

### Mobile Development
```bash
cd services/mobile
npm install
npm start
# Scan QR code with Expo Go app
```

## Project Structure

```
delivery-app/
├── services/
│   ├── backend/          # FastAPI application
│   │   ├── src/
│   │   │   ├── main.py   # API endpoints
│   │   │   ├── models/   # Domain models
│   │   │   └── schemas/  # API schemas
│   │   └── Dockerfile
│   └── mobile/           # Expo application
│       ├── src/
│       │   ├── screens/  # App screens
│       │   ├── api/      # API client
│       │   └── types/    # TypeScript types
│       ├── app.config.js
│       └── eas.json
├── infrastructure/       # Docker Compose
└── scripts/             # Build & deploy scripts
```

## Running the Checks

```bash
make test-backend     # pytest in the development container (15 tests)
make test-mobile      # jest (5 tests)
make test-todos       # TODO tracker test suite
```

Backend tests can also run without Docker:

```bash
cd services/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
pytest
```

Requires Docker Compose v2 (`docker compose`, not the retired
`docker-compose` v1) and Node 20+ for the Expo app.

## Deployment

### Backend
```bash
make deploy-backend  # Docker deployment
```

### Mobile
```bash
./scripts/build-mobile.sh all production
```

## Features

- ✅ Order creation and management
- ✅ Real-time order status tracking
- ✅ Driver location updates
- ✅ Health checks and monitoring
- ✅ Semantic versioning via Git
- ✅ CI/CD workflows
- ✅ Type-safe API contracts

## Documentation

- Backend API: http://localhost:8000/docs
- Mobile setup: services/mobile/README.md

---

Built with: FastAPI • Expo • Docker • TypeScript • PostgreSQL
