# Cdrive yedekleme ve felaket kurtarma runbook'u — ŞABLON

> **Bu belge bir ŞABLONDUR.** Canlı sunucudaki gerçek yedekleme script'i/prosedürü bu repoda olmadığı için
> içindeki adlar (konteyner, volume, yollar) `deploy/vds/docker-compose.yml`'e dayanan **varsayımlardır**.
> Kendi kurulumunuza göre uyarlayıp **test ortamında** provasını yapmadan güvenmeyin.

## 1. Ne yedeklenir
| Bileşen | Nerede | Yedek dosyası |
|---|---|---|
| MySQL veritabanı | konteyner `cdrive-mysql`, volume `cdrive_db_data` | `db_<zaman>.sql.gz` |
| Yüklenen dosyalar | volume `cdrive_storage` (`/app/storage`) | `storage_<zaman>.tar.gz` |
| Gizli değerler (`SESSION_SECRET`, DB parolası, OnlyOffice JWT) | compose dosyası / ortam | **Yedek dosyalarıyla birlikte SAKLAMAYIN**; ayrı, güvenli bir yerde tutun |

DB ve storage yedeği **aynı zaman damgasıyla** birlikte alınır ve **birlikte** geri yüklenir (DB kayıtları storage'daki dosyalara işaret eder).

## 2. Yedek alma
`deploy/templates/backup-template.sh` şablonunu kendi yolunuza kopyalayın, değişkenleri (`DB_CONTAINER`, `STORAGE_VOLUME`, `BACKUP_DIR`, `RETENTION_DAYS`) gözden geçirin, elle bir kez çalıştırıp çıktıyı doğrulayın, sonra cron'a ekleyin. Yedekleri başka bir makineye de kopyalayın.

## 3. Yedek doğrulama (haftalık öneri)
```bash
gzip -t /backups/db_<zaman>.sql.gz
tar -tzf /backups/storage_<zaman>.tar.gz > /dev/null
```
Ayrıca ayda bir gerçek bir **geri yükleme provası** yapın (bölüm 4'ü boş bir test makinesinde uygulayın).

## 4. Geri yükleme (felaket kurtarma)
> Canlıya dokunmadan önce: mevcut durumun bir yedeğini alın ve bakım penceresi ilan edin.

1. Uygulamayı durdurun (DB açık kalır): `docker compose stop cdrive`
2. Veritabanını geri yükleyin:
   ```bash
   gunzip -c /backups/db_<zaman>.sql.gz | docker exec -i cdrive-mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" cdrive'
   ```
   (Boş bir veritabanına yükleyin. Dolu bir veritabanının üzerine yazacaksanız önce `DROP DATABASE`/`CREATE DATABASE` gerekir — bilinçli yapın.)
3. Depolamayı geri yükleyin (volume önce boşaltılır):
   ```bash
   docker run --rm -v cdrive_storage:/data -v /backups:/in alpine sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; tar -xzf /in/storage_<zaman>.tar.gz -C /data'
   ```
4. Uygulamayı başlatın: `docker compose up -d cdrive` (başlangıçta `prisma migrate deploy` çalışır).
5. Doğrulama:
   - Giriş yapabiliyor musunuz, klasör/dosya listesi geliyor mu, birkaç dosya indirilip açılıyor mu?
   - `node --env-file=.env scripts/yetim-dosya-raporu.mjs` — "Eksik içerik" 0 olmalı (DB ve storage aynı çiftten geldiğinin kanıtı).
   - `node --env-file=.env scripts/kota-duzelt.mjs` — dry-run; sapma varsa raporu inceleyin.

## 5. Hedefler (kendi kurumunuza göre doldurun)
- RPO (kabul edilebilir veri kaybı): ______ (gecelik yedekte en fazla ~24 saat)
- RTO (kabul edilebilir kesinti): ______
- Yedek saklama: `RETENTION_DAYS` = ______; ikinci konum: ______
