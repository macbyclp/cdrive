#!/bin/sh
# root olarak başlarsa depolama dizininin sahipliğini "node" kullanıcısına verip yetkiyi düşürür;
# zaten root değilse komutu olduğu gibi çalıştırır. (Sahiplik yalnız gerekirse ve bir kez düzeltilir.)
set -e
if [ "$(id -u)" = "0" ]; then
  STORAGE="${STORAGE_ROOT:-/app/storage}"
  mkdir -p "$STORAGE"
  if [ "$(stat -c %U "$STORAGE")" != "node" ]; then
    chown -R node:node "$STORAGE"
  fi
  exec su-exec node "$@"
fi
exec "$@"
