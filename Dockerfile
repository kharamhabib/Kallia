# syntax=docker/dockerfile:1

# ---------- Stage 1: build do client React ----------
FROM node:22-bookworm AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- Stage 2: build do servidor Go (cgo + tag mlow) ----------
FROM golang:bookworm AS server
ENV GOTOOLCHAIN=auto
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
ENV CGO_ENABLED=1 \
    CC=gcc \
    CGO_LDFLAGS="-L/src/native -Wl,-rpath,/usr/local/lib"
RUN go build -tags mlow -o /kallia ./cmd/server

# ---------- Stage 3: runtime enxuto ----------
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates ffmpeg wget \
    && rm -rf /var/lib/apt/lists/*
COPY native/libopus_mlow.so /usr/local/lib/libopus_mlow.so
RUN ldconfig
COPY --from=server /kallia /usr/local/bin/kallia
COPY --from=client /app/client/dist /app/client/dist
WORKDIR /app
RUN mkdir -p /app/storage/recordings
EXPOSE 8080 50000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:8080/healthz || exit 1

ENTRYPOINT ["kallia"]
CMD ["-addr", ":8080", "-static", "/app/client/dist"]

