# Cdrive updater sidecar'ı (bkz. updater.mjs ve ../README.md).
# docker CLI + compose eklentisi + git gerekir; docker soketi konteynere bağlanır.
FROM node:22-alpine
RUN apk add --no-cache git docker-cli docker-cli-compose
WORKDIR /srv
COPY updater.mjs ./
ENV NODE_ENV=production
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9000/health >/dev/null 2>&1 || exit 1
# Docker soketine erişmek için root gerekir; bu yüzden servis compose ağının DIŞINA yayınlanmaz.
CMD ["node", "updater.mjs"]
