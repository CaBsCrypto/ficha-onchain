# syntax=docker/dockerfile:1
FROM node:22.22.0-bookworm-slim AS cli
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://github.com/stellar/stellar-cli/releases/download/v27.0.0/stellar-cli-27.0.0-x86_64-unknown-linux-gnu.tar.gz -o /tmp/stellar.tar.gz \
    && echo '357bf712f6353c28cd33c794402a3c87231757a5b305e6ef1604365af4fdd556  /tmp/stellar.tar.gz' | sha256sum -c - \
    && mkdir /tmp/stellar && tar -xzf /tmp/stellar.tar.gz -C /tmp/stellar \
    && install "$(find /tmp/stellar -type f -name stellar | head -n 1)" /usr/local/bin/stellar

FROM node:22.22.0-bookworm-slim AS dependencies
WORKDIR /app
COPY infra/worker/package.json infra/worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22.22.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=cli /usr/local/bin/stellar /usr/local/bin/stellar
COPY --from=dependencies --chown=node:node /app/ ./
COPY --chown=node:node scripts/worker-private-portal.mjs scripts/worker-doctor-authorizations.mjs scripts/worker-prescription-bookings.mjs ./scripts/
COPY --chown=node:node scripts/lib/private-worker-runtime.mjs scripts/lib/private-worker-session.mjs scripts/lib/private-registry.mjs scripts/lib/private-doctor-dossier.mjs ./scripts/lib/
RUN mkdir /app/runtime && chown node:node /app/runtime
ENV NODE_ENV=production STELLAR_CONFIG_DIR=/app/runtime STELLAR_NETWORK=testnet TRUSTLEAF_SIGNER_MODE=secret-file TRUSTLEAF_PRIVATE_WRITES_ENABLED=false
USER node
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "scripts/worker-private-portal.mjs"]
CMD ["--watch"]
