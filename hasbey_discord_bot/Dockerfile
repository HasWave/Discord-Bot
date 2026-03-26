ARG BUILD_FROM=node:22-alpine
FROM ${BUILD_FROM}

WORKDIR /app

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
