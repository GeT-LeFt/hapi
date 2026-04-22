# ---- Stage 1: Builder ----
FROM oven/bun:1.3.5-debian AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY shared/package.json shared/
COPY cli/package.json cli/
COPY hub/package.json hub/
COPY web/package.json web/
COPY website/package.json website/
COPY docs/package.json docs/

RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY cli/ cli/
COPY hub/ hub/
COPY web/ web/

RUN mkdir -p hub/tools/tunwg && touch hub/tools/tunwg/tunwg-x64-linux

RUN bun run build:web

RUN cd hub && bun run generate:embedded-web-assets

RUN cd cli && bun run build:exe:allinone

# ---- Stage 2: Production ----
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        ca-certificates \
        curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/cli/dist-exe/bun-linux-x64-baseline/hapi /usr/bin/hapi
RUN chmod +x /usr/bin/hapi

ENV HAPI_HOME=/root/.hapi
VOLUME ["/root/.hapi"]

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3006/health || exit 1

ENTRYPOINT ["/usr/bin/hapi"]
CMD ["hub"]
