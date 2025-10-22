# Multi-stage Dockerfile for FastAPI Backend
FROM python:3.11-slim as base
WORKDIR /app
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
COPY services/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base as development
RUN pip install --no-cache-dir pytest pytest-cov black flake8
COPY services/backend/src ./src
COPY services/backend/tests ./tests
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base as production
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
RUN pip install --no-cache-dir gunicorn uvicorn[standard]
COPY services/backend/src ./src
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
CMD ["gunicorn", "src.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
