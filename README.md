# Cdrive

Kurumsal dosya yönetim platformu — departmanlar arası klasör/dosya paylaşımı, rol tabanlı erişim, versiyon geçmişi ve denetim günlüğü.

## Özellikler

- **Kimlik doğrulama**: E-posta/şifre girişi, `jose` ile imzalı JWT oturum çerezi (httpOnly).
- **Roller**: `ADMIN` (her şeye erişir, kullanıcı/departman yönetir), `MANAGER` (kendi departmanının tüm dosyalarını yönetir), `MEMBER` (kendi dosyaları + kendisiyle paylaşılanlar).
- **Klasör/dosya yönetimi**: İç içe klasörler, çoklu dosya yükleme, yeniden adlandırma, taşıma, silme (soft-delete).
- **Paylaşım**: Kullanıcıya e-posta ile Görüntüle/Düzenle izni verme; ayrıca süre/limit ayarlanabilen genel (herkese açık) indirme bağlantıları.
- **Versiyonlama**: Aynı klasöre aynı isimle tekrar yükleme yeni versiyon oluşturur; eski versiyona geri dönülebilir.
- **Arama**: Dosya adına göre ve (metin/PDF dosyalarında) içeriğe göre tam metin arama, erişim yetkisiyle filtrelenmiş.
- **Güvenlik**: Giriş denemelerinde IP bazlı hız sınırlama, 5 başarısız denemeden sonra hesap kilitleme (15 dk), isteğe bağlı TOTP tabanlı iki adımlı doğrulama (2FA), kendi hesap ayarlarından şifre değiştirme.
- **Bildirimler**: Biriyle bir dosya/klasör paylaşıldığında uygulama içi bildirim (zil ikonu, okunmamış sayacı).
- **Depolama kotası**: Kullanıcı ve departman bazlı, aşıldığında yükleme reddedilir; admin panelinden düzenlenebilir.
- **Çöp kutusu**: Silinen dosya/klasörler geri getirilebilir veya kalıcı olarak silinebilir (purge).
- **Son kullanılanlar & Favoriler**: Son açılan/indirilen dosyalar ve yıldızlanan öğeler için ayrı görünümler.
- **Toplu işlemler**: Çoklu seçimle birden fazla dosya/klasörü aynı anda taşıma, silme veya indirme.
- **Sürükle-bırak yükleme**: Dosyaları doğrudan tarayıcıya sürükleyip bırakarak yükleme.
- **Klasörü .zip olarak indirme**: Bir klasörün tüm alt ağacını tek bir zip dosyası halinde indirme.
- **Şifreli paylaşım bağlantıları**: Genel bağlantılara opsiyonel şifre koruması; `/s/[token]` herkese açık iniş sayfası.
- **Tema**: Açık/Koyu/Sistem, liste veya ızgara (kart) görünümü — tercihler tarayıcıda kalıcı.
- **Sürükle-bırak ile taşıma**: Dosya/klasörleri başka bir klasörün veya "Sürücüm" kök konumunun üzerine sürükleyip bırakarak taşıma (liste ve ızgara görünümlerinin ikisinde de).
- **Oturum yönetimi**: Hesabına giriş yapılmış tüm cihazları `Hesap ayarları`'ndan görme, tek tek veya toplu olarak uzaktan sonlandırma (DB destekli oturum kaydı — JWT geçerli olsa bile sunucudan iptal edilebilir).
- **Otomatik veri temizleme politikası**: Admin panelinden çöp kutusu ve eski dosya versiyonları için saklama süresi (gün) belirleme; cPanel Cron Job ile otomatikleştirilebilir (bkz. aşağıda).
- **Dosya yükleme politikaları**: Admin panelinden sistem geneli maksimum dosya boyutu ve engellenen dosya uzantıları tanımlama.
- **Admin paneli**: Kullanıcı/departman yönetimi, depolama analitiği (departman/kullanıcı bazlı kullanım grafikleri), tüm sistem etkinlik günlüğü (giriş, yükleme, silme, paylaşım vb.), sistem ayarları (temizleme politikası + dosya politikaları).
- **Office belge düzenleme (opsiyonel)**: Ayrı bir OnlyOffice Document Server'a bağlanarak Word/Excel/PowerPoint dosyalarını tarayıcıda gerçek zamanlı düzenleme; kaydetme yeni bir dosya versiyonu olarak geri döner (bkz. aşağıda).
- **Yeni boş belge oluşturma**: "+ Yeni" menüsünden doğrudan Cdrive içinde boş bir Word/Excel/PowerPoint dosyası oluşturma (OnlyOffice gerektirmez — sadece sonradan düzenlemek için gerekir).
- **Format dönüştürme (opsiyonel)**: docx/xlsx/pptx gibi belgeleri PDF'e dönüştürme — sonuç, orijinali değiştirmeden ayrı bir dosya olarak kaydedilir (OnlyOffice Document Server gerektirir).
- **Medya galerisi**: Erişilebilen tüm video/müzik dosyaları için ayrı bir "Medya" görünümü; video/ses dosyaları artık tarayıcıda doğrudan oynatılabilir (indirmeye gerek yok).

## Teknoloji

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- MySQL/MariaDB + Prisma ORM (paylaşımlı hosting/cPanel uyumluluğu için — bkz. not aşağıda)
- Tailwind CSS 4
- `archiver` — klasör zip indirme
- Dosyalar yerel diskte saklanır (`STORAGE_ROOT`, varsayılan `./storage`)

> **Not:** Proje başlangıçta PostgreSQL ile geliştirildi, 2026-08-16'da hedef hosting ortamı
> (cPanel + Node.js App, sadece MySQL/MariaDB destekliyor) nedeniyle MySQL'e taşındı. Şema
> Postgres'e özgü hiçbir özellik kullanmıyor; PostgreSQL'e dönmek isterseniz
> `prisma/schema.prisma`'da `provider = "postgresql"` yapıp migration'ları yeniden oluşturmanız yeterli.

## Kurulum

1. `.env` dosyasındaki `DATABASE_URL` ve `SESSION_SECRET` değerlerini kontrol edin (yerel geliştirme için hazır değerler bırakıldı — **production'da `SESSION_SECRET`'ı mutlaka değiştirin**). `DATABASE_URL` formatı: `mysql://KULLANICI:SIFRE@HOST:3306/VERITABANI`.
2. MySQL/MariaDB sunucusunun çalıştığından ve veritabanının oluşturulmuş olduğundan emin olun.
3. Bağımlılıkları kurun ve migration'ları uygulayın:

   ```bash
   npm install
   npx prisma migrate deploy
   ```

4. Geliştirme sunucusunu başlatın:

   ```bash
   npm run dev
   ```

5. Tarayıcıda `http://localhost:3000` adresine gidin. Sistemde hiç kullanıcı yoksa otomatik olarak `/setup` sayfasına yönlendirilip ilk yönetici hesabı oluşturulur.

## cPanel / paylaşımlı hosting'e deploy

1. cPanel'de **Setup Node.js App** ile yeni bir uygulama oluşturun (Node.js 18+, application root = proje klasörü, application URL = alan adınız/alt dizin).
2. cPanel'de bir **MySQL Database** ve kullanıcı oluşturup uygulamaya tam yetki verin; bağlantı bilgilerini `DATABASE_URL` olarak `.env`'e (veya Node.js App arayüzündeki "Environment variables" bölümüne) girin.
3. cPanel'in sağladığı "Enter to the virtual environment" terminalinden: `npm install`, `npx prisma migrate deploy`, `npm run build`.
4. Node.js App arayüzünde **Startup File** olarak proje kökündeki `server.js`'i seçin (cPanel'in Passenger'ı `next start` komutunu değil, `process.env.PORT`'ta dinleyen bir `.js` giriş dosyası bekler — bu dosya projede hazır).
5. Uygulamayı **Restart** edip alan adınızdan açın; hiç kullanıcı yoksa `/setup`'a yönlendirilecektir.

## Otomatik veri temizleme (Cron Job)

Admin panelindeki **Sistem ayarları** sekmesinden çöp kutusu ve eski dosya versiyonları için bir saklama
süresi (gün) belirlediyseniz, bu politikayı düzenli olarak uygulamak için `POST /api/admin/cleanup`
uç noktasını periyodik çağırmanız gerekir — aksi halde yalnızca admin panelindeki "Şimdi çalıştır"
butonuyla elle tetiklenir.

1. `.env`'e rastgele, tahmin edilemez bir `CRON_SECRET` değeri ekleyin (ör. `openssl rand -hex 32`).
2. cPanel'de **Cron Jobs** bölümünden günlük (veya istediğiniz sıklıkta) bir görev oluşturun:

   ```bash
   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://alan-adiniz.com/api/admin/cleanup
   ```

`CRON_SECRET` tanımlı değilse bu uç nokta yalnızca oturum açmış bir admin tarafından çağrılabilir
(cron için Authorization başlığı zorunlu değildir, ama önerilir).

## Office belge düzenleme (OnlyOffice — opsiyonel)

Word/Excel/PowerPoint dosyalarını tarayıcıda gerçek düzenleyici arayüzüyle açmak için Cdrive,
**ayrı bir sunucuda** çalışan bir [OnlyOffice Document Server](https://github.com/ONLYOFFICE/DocumentServer)'a
bağlanır. Bu, cPanel paylaşımlı hosting'de çalışmaz (Docker gerektirir) — Docker destekleyen
ayrı bir VPS'iniz olmalı. Bu özellik olmadan Cdrive'ın geri kalanı normal çalışmaya devam eder;
sadece dosya menüsündeki "Office ile aç" seçeneği görünmez (`ONLYOFFICE_URL`/`APP_URL` boşsa).

**Nasıl çalışır:** Document Server, Cdrive'a normal bir tarayıcı gibi oturum çereziyle değil,
her düzenleme oturumu için üretilen kısa ömürlü (15 dk) bir token ile bağlanır — dosya
içeriğini bu token'lı bir uç noktadan indirir, kullanıcı kaydettiğinde güncellenmiş belgeyi
yine bu token'lı bir callback'e gönderir; Cdrive bunu normal bir versiyon yükleme gibi işler
(kota/dosya politikaları da uygulanır).

1. `deploy/onlyoffice/docker-compose.yml`'i VPS'inize kopyalayıp içindeki `JWT_SECRET`'ı
   rastgele bir değerle değiştirin, `docker compose up -d` ile başlatın.
2. VPS'te bir ters proxy ile Document Server'a HTTPS + bir alan adı verin (ör. `office.alan-adiniz.com`).
3. Cdrive'ın `.env`'ine ekleyin:
   - `APP_URL` — Cdrive'ın kendi herkese açık HTTPS adresi (Document Server bunu kullanarak Cdrive'a bağlanır).
   - `ONLYOFFICE_URL` — Document Server'ın HTTPS adresi.
   - `ONLYOFFICE_JWT_SECRET` — docker-compose.yml'deki `JWT_SECRET` ile **aynı** değer.
4. Cdrive'ı yeniden başlatın. Desteklenen bir dosyada (docx/xlsx/pptx vb.) artık "Office ile aç"
   seçeneği görünür.

> Bu iki servis birbirine internet üzerinden HTTPS ile bağlanabilmelidir (ikisi de aynı VPS'te
> olabilir ya da farklı sunucularda — önemli olan karşılıklı erişilebilirlik ve geçerli TLS).

## Testler

Kritik iş mantığı (izin/erişim hesaplama, çöp kutusu kota muhasebesi, TOTP, format yardımcıları) için Vitest ile otomatik testler var. Entegrasyon testleri ayrı bir `cdrive_test` veritabanına karşı çalışır (`.env.test`), asla geliştirme/production verisine dokunmaz.

```bash
# Bir kere: ayrı test veritabanını oluşturup migration'ları uygulayın
mysql -u root -p -e "CREATE DATABASE cdrive_test CHARACTER SET utf8mb4;"
DATABASE_URL="mysql://KULLANICI:SIFRE@localhost:3306/cdrive_test" npx prisma migrate deploy

npm test          # tek seferlik çalıştırma
npm run test:watch # izleme modu
```

## Dizin yapısı (özet)

- `src/app/api/**` — REST API uç noktaları (auth, folders, files, share, permissions, admin, search, account, notifications, trash, stars)
- `src/lib/access.ts` — klasör/dosya izin hesaplama mantığı (sahiplik, departman, açık izinler, kalıtım)
- `src/lib/storage.ts` — dosyaların diske yazılıp okunması
- `src/lib/totp.ts` — sıfır bağımlılıklı TOTP (RFC 6238) implementasyonu
- `src/lib/text-extract.ts` — tam metin arama için dosya içeriği çıkarımı
- `src/app/drive` — ana dosya tarayıcısı arayüzü
- `src/app/admin` — yönetim paneli
- `src/app/account` — kullanıcının kendi hesap ayarları (şifre, 2FA)
- `tests/` — Vitest testleri (`unit/` DB gerektirmez, `integration/` ayrı test veritabanına karşı çalışır)
- `prisma/schema.prisma` — veri modeli
