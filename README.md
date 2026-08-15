# Cdrive

Kurumsal dosya yönetim platformu — departmanlar arası klasör/dosya paylaşımı, rol tabanlı erişim, versiyon geçmişi ve denetim günlüğü.

## Özellikler

- **Kimlik doğrulama**: E-posta/şifre girişi, `jose` ile imzalı JWT oturum çerezi (httpOnly).
- **Roller**: `ADMIN` (her şeye erişir, kullanıcı/departman yönetir), `MANAGER` (kendi departmanının tüm dosyalarını yönetir), `MEMBER` (kendi dosyaları + kendisiyle paylaşılanlar).
- **Klasör/dosya yönetimi**: İç içe klasörler, çoklu dosya yükleme, yeniden adlandırma, taşıma, silme (soft-delete).
- **Paylaşım**: Kullanıcıya e-posta ile Görüntüle/Düzenle izni verme; ayrıca süre/limit ayarlanabilen genel (herkese açık) indirme bağlantıları.
- **Versiyonlama**: Aynı klasöre aynı isimle tekrar yükleme yeni versiyon oluşturur; eski versiyona geri dönülebilir.
- **Arama**: Dosya adına göre, erişim yetkisiyle filtrelenmiş arama.
- **Depolama kotası**: Kullanıcı ve departman bazlı, aşıldığında yükleme reddedilir.
- **Admin paneli**: Kullanıcı oluşturma/düzenleme (rol, departman, kota, aktif/pasif), departman yönetimi, tüm sistem etkinlik günlüğü (giriş, yükleme, silme, paylaşım vb.).

## Teknoloji

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- PostgreSQL + Prisma ORM
- Tailwind CSS 4
- Dosyalar yerel diskte saklanır (`STORAGE_ROOT`, varsayılan `./storage`)

## Kurulum

1. `.env` dosyasındaki `DATABASE_URL` ve `SESSION_SECRET` değerlerini kontrol edin (yerel geliştirme için hazır değerler bırakıldı — **production'da `SESSION_SECRET`'ı mutlaka değiştirin**).
2. PostgreSQL sunucusunun çalıştığından emin olun.
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

## Dizin yapısı (özet)

- `src/app/api/**` — REST API uç noktaları (auth, folders, files, share, permissions, admin, search)
- `src/lib/access.ts` — klasör/dosya izin hesaplama mantığı (sahiplik, departman, açık izinler, kalıtım)
- `src/lib/storage.ts` — dosyaların diske yazılıp okunması
- `src/app/drive` — ana dosya tarayıcısı arayüzü
- `src/app/admin` — yönetim paneli
- `prisma/schema.prisma` — veri modeli
