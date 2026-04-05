ARG BUILD_FROM=docker.io/library/node:20-bookworm-slim
FROM ${BUILD_FROM}

WORKDIR /app

# Native modül (@napi-rs/canvas) ön derleme yoksa kaynak derleme için
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN set -eux; \
    if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

COPY . .
RUN sed -i 's/\r$//' /app/run.sh && chmod +x /app/run.sh

CMD ["/bin/sh", "/app/run.sh"]
