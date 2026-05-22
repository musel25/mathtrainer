# syntax=docker/dockerfile:1

# --- Stage 1: build the React single-page app ---
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python runtime ---
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app

# Runtime dependencies only. The app runs from source (via PYTHONPATH) rather
# than as an installed package, so app.py can resolve ../frontend/dist
# relative to its own location.
RUN uv pip install --system --no-cache \
      "fastapi>=0.136.1" \
      "uvicorn[standard]>=0.47.0" \
      "pydantic>=2.13.4"

COPY src/ ./src/
COPY --from=frontend /app/frontend/dist ./frontend/dist

# /data is a mounted volume holding the SQLite database (see compose.yaml).
RUN mkdir -p /data
ENV PYTHONPATH=/app/src \
    MATHTRAINER_DB=/data/mathtrainer.db
EXPOSE 8000

CMD ["uvicorn", "mathtrainer.app:app", "--host", "0.0.0.0", "--port", "8000"]
