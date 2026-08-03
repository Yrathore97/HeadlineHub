# --- Multi-stage Dockerfile for Astro Frontend & FastAPI Backend ---

# Stage 1: Frontend Build
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 4321
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]

# Stage 2: FastAPI Backend
FROM python:3.11-slim AS backend
WORKDIR /app
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt || true
COPY backend/ ./backend/
EXPOSE 8000
CMD ["python", "backend/app/main.py"]
