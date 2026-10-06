# VDS kurulumu ve uzaktan güncelleme

Bu klasör, Cdrive'ı bir VDS'te Docker ile çalıştırmak içindir. Kurulumdan sonra **SSH'siz güncelleme** yapabilirsiniz:
**Yönetim → Güncelleme → Şimdi güncelle**.

## Mimari

```
Tarayıcı ──► cdrive (uygulama) ──HTTP + Bearer──► cdrive-updater ──docker.sock──► docker compose
                 │                                     │
                 └── GitHub API (yeni sürüm var mı?)   └── git fetch/reset → build → up -d → sağlık kontrolü
```

- **cdrive** (uygulama): yalnızca GitHub'dan yeni sürüm olup olmadığına bakar ve updater'a "güncelle" der. **Docker soketine erişimi yoktur.**
- **cdrive-updater** (sidecar): kodu çeker, imajı derler, konteyneri yeniden başlatır. Yalnızca compose ağından erişilir (port yayınlanmaz), Bearer belirteciyle korunur ve **yalnızca yapılandırılmış depo/dalı** günceller — dışarıdan komut, dal veya yol kabul etmez.

Bir güncellemenin adımları:

1. `git fetch` — zaten güncelse hiçbir şey yapmadan biter.
2. **Veritabanı yedeği** (`./backups/cdrive-<tarih>.sql.gz`, son 7 yedek tutulur; boş yedekte güncelleme iptal edilir).
3. Çalışan imaj `cdrive-app:rollback` olarak etiketlenir.
4. `git reset --hard origin/<dal>` ve `docker compose build cdrive`.
5. `docker compose up -d --no-deps cdrive` — migration'lar uygulama açılırken otomatik uygulanır.
6. Sağlık kontrolü (en çok 240 sn). **Sağlıklı açılmazsa otomatik olarak önceki sürüme dönülür.**

## İlk kurulum

```bash
mkdir -p ~/cdrive-deploy && cd ~/cdrive-deploy
git clone https://github.com/macbyclp/cdrive.git app
cp app/deploy/vds/docker-compose.yml .
```

`docker-compose.yml` içindeki tüm `replace-with-...` değerlerini doldurun. **`UPDATER_TOKEN` iki serviste (cdrive ve cdrive-updater) aynı olmalı:**

```bash
openssl rand -hex 32     # çıktıyı iki yere de yazın
```

Sonra:

```bash
docker compose up -d --build
```

Caddy/nginx ile `cdrive` servisinin 3001 portunu alan adınıza yönlendirin (bkz. compose dosyasındaki 5. adım). **`cdrive-updater`'ı dışarı açmayın.**

Yönetim → **Güncelleme** sekmesi çalışan sürümü (commit) ve GitHub'daki son sürümü gösterir.

### Ortam değişkenleri

| Değişken | Nerede | Anlamı |
| --- | --- | --- |
| `UPDATER_URL` | cdrive | `http://cdrive-updater:9000` |
| `UPDATER_TOKEN` | cdrive + cdrive-updater | Ortak gizli anahtar (≥ 24 karakter) |
| `UPDATE_REPO` | cdrive | İzlenen GitHub deposu (varsayılan `macbyclp/cdrive`) |
| `UPDATE_BRANCH` | cdrive + cdrive-updater | İzlenen dal (varsayılan `main`) |
| `GITHUB_TOKEN` | cdrive (opsiyonel) | Özel depo veya API hız sınırı için |
| `UPDATE_REQUIRE_VERIFIED` | cdrive (opsiyonel) | `1` ise yalnız GitHub'da **imzalı (Verified)** commit'ler kurulabilir; imzasız commit 403 ile reddedilir |
| `KEEP_BACKUPS`, `HEALTH_TIMEOUT_S` | cdrive-updater (opsiyonel) | Yedek sayısı / sağlık bekleme süresi |

## Güvenlik notları

- Updater'a bağlanan **docker soketi sunucuda root eşdeğeri yetkidir.** Bu yüzden updater ayrı, küçük bir servistir, portu yayınlanmaz ve token'sız hiçbir şey yapmaz.
- Güncelleme yalnızca **ADMIN** rolüyle başlatılabilir ve denetim kaydına yazılır (`SETTINGS_UPDATE`).
- `main` dalına gelen her şey bir sonraki güncellemede canlıya gider. Dalı korumalı tutun (PR + CI). İsterseniz `UPDATE_BRANCH` ile ayrı bir `production` dalını izleyin.
- **Onayladığınız commit kurulur.** Panelde gördüğünüz commit'in sha'sı updater'a iletilir; updater yalnızca yapılandırılmış dalın geçmişindeki o commit'i kurar. Siz "Güncelle"ye basana kadar dala itilen başka bir commit sessizce kurulmaz. (Bunun için updater imajını yeniden derleyin: `docker compose up -d --build cdrive-updater`; eski updater sha'yı yok sayıp dalın ucunu kurar.)
- Panelde imzasız commit'ler **İmzasız** rozetiyle işaretlenir. `UPDATE_REQUIRE_VERIFIED=1` ile imzasız commit'in kurulumunu tamamen engelleyebilirsiniz (GitHub'da commit imzalama / vigilant mode açık olmalı; web arayüzünden yapılan merge'ler GitHub tarafından imzalanır).
- Sürümü sabitlemek/geri almak istiyorsanız `UPDATE_BRANCH`'i bir dala, o dalı da istediğiniz commit'e taşıyın.

## Sorun giderme

- **"Güncelleme servisi yapılandırılmamış"** — `UPDATER_URL`/`UPDATER_TOKEN` cdrive servisinde ayarlı değil.
- **"Güncelleme servisine ulaşılamıyor"** — `docker compose ps` ile `cdrive-updater` çalışıyor mu bakın; token iki serviste aynı mı kontrol edin; günlük: `docker logs cdrive-updater`.
- **Sürüm kartında commit "?"** — imaj elle (`up --build`) derlenmiş; ilk uzaktan güncellemeden sonra dolar. Güncelleme yine çalışır.
- **Güncelleme "geri alındı"** — yeni sürüm sağlıklı açılmadı; günlük panelde görünür. Migration'lar ileri yönlüdür; veritabanı şemasını da geri almak gerekirse yedekten dönün:
  ```bash
  gunzip -c backups/cdrive-<tarih>.sql.gz | docker exec -i cdrive-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" cdrive'
  ```
- **Updater'ın kendisini güncellemek** (nadiren gerekir): `cd ~/cdrive-deploy && docker compose up -d --build cdrive-updater`.
- Yerelde akışı denemek için: `UPDATER_DRY_RUN=1 UPDATER_TOKEN=<24+ karakter> node app/deploy/vds/updater/updater.mjs` — komutları çalıştırmadan yalnızca günlüğe yazar.
