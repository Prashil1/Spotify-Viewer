# ---- Stage 1: Build the Next.js frontend static export ----
FROM node:20-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Build the Go backend (embeds the frontend) ----
FROM golang:1.24-alpine AS backend
RUN apk add --no-cache gcc musl-dev sqlite-dev
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Copy the frontend static export into the embed directory
COPY --from=frontend /src/frontend/out/ cmd/server/frontend_out/
ENV CGO_ENABLED=1
RUN go build -o /app/spotify-viewer ./cmd/server

# ---- Stage 3: Minimal runtime image ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates sqlite-libs
WORKDIR /app
COPY --from=backend /app/spotify-viewer .
EXPOSE 8020
ENTRYPOINT ["./spotify-viewer", "-config", "/app/config.yaml"]
