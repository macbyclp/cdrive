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
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Prisma'nın query engine binary'si Alpine'da (musl) OpenSSL'e dinamik link olur.
RUN apk add --no-cache openssl
ENV NODE_ENV=production
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

EXPOSE 3000
# Her başlangıçta migration'ları uygular (idempotent — zaten uygulanmışsa
# atlar), sonra sunucuyu başlatır.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node server.js"]
