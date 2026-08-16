# Cdrive

Kurumsal dosya yönetim platformu — departmanlar arası klasör/dosya paylaşımı, rol tabanlı erişim, versiyon geçmişi ve denetim günlüğü.

## Özellikler

- **Kimlik doğrulama**: E-posta/şifre girişi, `jose` ile imzalı JWT oturum çerezi (httpOnly).
- **Roller**: `ADMIN` (her şeye erişir, kullanıcı/departman yönetir), `MANAGER` (kendi departmanının tüm dosyalarını yönetir), `MEMBER` (kendi dosyaları + kendisiyle paylaşılanlar).
- **Klasör/dosya yönetimi**: İç içe klasörler, çoklu dosya yükleme, yeniden adlandırma, taşıma, silme (soft-delete).
- **Paylaşım**: Kullanıcıya e-posta ile Görüntüle/Düzenle izni verme; ayrıca süre/limit ayarlanabilen genel (herkese açık) indirme bağlantıları.
- **Versiyonlama**: Aynı klasöre aynı isimle tekrar yükleme yeni versiyon oluşturur; eski versiyona geri dönülebilir.
- **Arama**: Dosya adına göre, erişim yetkisiyle filtrelenmiş arama.
- **Depolama kotası**: Kullanıcı ve departman bazlı, aşıldığında yükleme reddedilir; admin panelinden düzenlenebilir.
- **Çöp kutusu**: Silinen dosya/klasörler geri getirilebilir veya kalıcı olarak silinebilir (purge).
- **Son kullanılanlar & Favoriler**: Son açılan/indirilen dosyalar ve yıldızlanan öğeler için ayrı görünümler.
- **Toplu işlemler**: Çoklu seçimle birden fazla dosya/klasörü aynı anda taşıma, silme veya indirme.
- **Sürükle-bırak yükleme**: Dosyaları doğrudan tarayıcıya sürükleyip bırakarak yükleme.
- **Klasörü .zip olarak indirme**: Bir klasörün tüm alt ağacını tek bir zip dosyası halinde indirme.
- **Şifreli paylaşım bağlantıları**: Genel bağlantılara opsiyonel şifre koruması; `/s/[token]` herkese açık iniş sayfası.
- **Tema**: Açık/Koyu/Sistem, liste veya ızgara (kart) görünümü — tercihler tarayıcıda kalıcı.
- **Admin paneli**: Kullanıcı/departman yönetimi, depolama analitiği (departman/kullanıcı bazlı kullanım grafikleri), tüm sistem etkinlik günlüğü (giriş, yükleme, silme, paylaşım vb.).

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

## Dizin yapısı (özet)

- `src/app/api/**` — REST API uç noktaları (auth, folders, files, share, permissions, admin, search)
- `src/lib/access.ts` — klasör/dosya izin hesaplama mantığı (sahiplik, departman, açık izinler, kalıtım)
- `src/lib/storage.ts` — dosyaların diske yazılıp okunması
- `src/app/drive` — ana dosya tarayıcısı arayüzü
- `src/app/admin` — yönetim paneli
- `prisma/schema.prisma` — veri modeli
