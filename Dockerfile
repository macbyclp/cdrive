# Cdrive — VDS/Docker deploy image (bkz. deploy/vds/docker-compose.yml).
# Next.js'in "standalone" çıktısını kullanır: sadece gerçekten gereken
# node_modules'ü içeren küçük, bağımsız bir server.js üretir.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build sırasında gerçek DATABASE_URL'e ihtiyaç yok (Prisma generate şemayı
# okur, veritabanına bağlanmaz) ama prisma.config.ts/schema onu bekleyebilir.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
# ÖNEMLİ: Next.js basePath DERLEME ZAMANINDA sabitlenir, container runtime'da
# verilen ortam değişkeniyle DEĞİŞTİRİLEMEZ — bu yüzden burada bir build-arg
# olarak alıp ENV'e yazıyoruz (docker-compose.yml'deki `build.args` ile verilir;
# verilmezse next.config.ts varsayılan olarak "/cdrive" kullanır).
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH
# Güvenlik başlıkları derleme zamanında sabitlenir: CSP'yi zorlamak için build-arg CSP_ENFORCE=1.
ARG CSP_ENFORCE=""
ENV CSP_ENFORCE=$CSP_ENFORCE
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Prisma'nın query engine binary'si Alpine'da (musl) OpenSSL'e dinamik link olur.
RUN apk add --no-cache openssl su-exec
ENV NODE_ENV=production
# Next standalone, Docker'un verdiği HOSTNAME (konteyner kimliği) adresine bağlanır; 127.0.0.1 healthcheck'i ve port yayınlama için tüm arayüzlerde dinle.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# "prisma" CLI paketinin kendisi (standalone'un dependency tracing'i sadece
# çalışma zamanında import edilen kodu yakalar; CLI, package.json script'i
# dışında hiç import edilmediği için elle kopyalanması gerekiyor).
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma

# Root olarak DEĞİL "node" kullanıcısıyla çalışır. Mevcut depolama volume'ü (eskiden root ile yazılmış olabilir)
# bozulmasın diye giriş noktası önce sahipliği düzeltir, sonra yetkiyi düşürür (bkz. docker-entrypoint.sh).
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/ >/dev/null 2>&1 || exit 1
# Her başlangıçta migration'ları uygular (idempotent — zaten uygulanmışsa
# atlar), sonra sunucuyu başlatır. `./node_modules/.bin/prisma` sembolik
# linkini KOPYALAMADIK (sadece hedef paketleri) — bu yüzden CLI'nin gerçek
# giriş dosyasını doğrudan `node` ile çalıştırıyoruz.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy && node server.js"]
