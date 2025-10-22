#!/usr/bin/env bash
set -euo pipefail
MAX_ATTEMPTS=30
ATTEMPT=0
echo "Checking backend health..."
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:8000/health >/dev/null; then
        echo "✓ Backend is healthy"
        exit 0
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Waiting... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done
echo "✗ Health check failed"
exit 1
