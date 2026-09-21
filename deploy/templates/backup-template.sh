#!/usr/bin/env bash
# =============================================================================
#  ŞABLON — Cdrive için GENEL yedekleme script'i (docker + MySQL)
# =============================================================================
#  BU DOSYA BİR ŞABLONDUR. Canlı sunucudaki gerçek script'in (ör. ~/cdrive-deploy/backup-all.sh)
#  bir kopyası DEĞİLDİR; onun içeriği bu repoda bulunmadığı için buradaki değerler VARSAYIMDIR.
#  Kullanmadan önce konteyner/volume adlarını, yolları ve saklama süresini KENDİ kurulumunuza
#  göre gözden geçirip önce bir TEST ortamında deneyin.
#
#  Varsayılan adlar deploy/vds/docker-compose.yml'den alınmıştır:
#    DB konteyneri : cdrive-mysql        (env: DB_CONTAINER)
#    Storage volume: cdrive_storage      (env: STORAGE_VOLUME; compose proje öneki varsa değiştirin)
#
#  Ürettiği dosyalar (BACKUP_DIR altında, admin panelindeki "Yedekler" kartı bu adları okur):
#    db_YYYYmmdd_HHMMSS.sql.gz        — mysqldump (tutarlı: --single-transaction)
#    storage_YYYYmmdd_HHMMSS.tar.gz   — yüklenen dosyaların (storage volume) arşivi
#  DB ve storage AYNI zaman damgasını paylaşır; geri yüklerken çiftin birlikte kullanılması gerekir.
#
#  Gizli değerler: MySQL root parolası script'e YAZILMAZ; konteynerin kendi ortamındaki
#  MYSQL_ROOT_PASSWORD kullanılır (docker exec içinde). Parolayı komut satırına yazmayın.
#
#  Zamanlama örneği (cron, her gece 03:15):
#    15 3 * * *  /opt/cdrive/backup-template.sh >> /var/log/cdrive-backup.log 2>&1
# =============================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-cdrive-mysql}"
DB_NAME="${DB_NAME:-cdrive}"
STORAGE_VOLUME="${STORAGE_VOLUME:-cdrive_storage}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TS="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
umask 077   # yedekler yalnız sahibi tarafından okunabilsin

echo "[$(date -Is)] yedek başlıyor: $TS"

# 1) Veritabanı: konteynerin kendi MYSQL_ROOT_PASSWORD ortam değişkeni kullanılır (parola dışarı çıkmaz).
docker exec "$DB_CONTAINER" sh -c \
  'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" "$1"' _ "$DB_NAME" \
  | gzip -9 > "$BACKUP_DIR/db_${TS}.sql.gz.tmp"
mv "$BACKUP_DIR/db_${TS}.sql.gz.tmp" "$BACKUP_DIR/db_${TS}.sql.gz"

# 2) Dosya depolaması: volume salt-okunur bağlanıp arşivlenir.
docker run --rm -v "${STORAGE_VOLUME}:/data:ro" -v "${BACKUP_DIR}:/out" alpine \
  tar -czf "/out/storage_${TS}.tar.gz.tmp" -C /data .
mv "$BACKUP_DIR/storage_${TS}.tar.gz.tmp" "$BACKUP_DIR/storage_${TS}.tar.gz"

# 3) Bütünlük: gzip/tar dosyaları okunabiliyor mu?
gzip -t "$BACKUP_DIR/db_${TS}.sql.gz"
tar -tzf "$BACKUP_DIR/storage_${TS}.tar.gz" >/dev/null

# 4) Saklama: eski yedekleri sil (yalnız bu adlandırma desenindekiler).
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.sql.gz' -o -name 'storage_*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Is)] yedek tamam: db_${TS}.sql.gz + storage_${TS}.tar.gz"
# Öneri: yedekleri BAŞKA bir makineye/nesne depolamaya da kopyalayın (rsync/rclone) — aynı diskteki yedek yedek sayılmaz.
