<div align="center">

# CDrive

### Kurumsal dosyalarınız. Kendi sunucunuzda. Tam kontrolünüzde.

Departman, rol ve izin temelli, **self-hosted** dosya yönetimi ve işbirliği platformu.
Google Drive rahatlığı, ama veri sizin diskinizde.

[![Canlı örnek](https://img.shields.io/badge/canlı-cdrive.calapverdi.tr-6C63FF?style=for-the-badge)](https://cdrive.calapverdi.tr)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-MySQL%2FMariaDB-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Self-hosted](https://img.shields.io/badge/self--hosted-evet-16a34a?style=for-the-badge)

![CDrive dosya listesi](docs/readme-assets/drive-folder.png)

</div>

---

## Manifesto

> **Veri egemenliği önce gelir.**

Şirket dosyaları üçüncü taraf bir buluta ait değildir. CDrive; dosyaların, kullanıcıların ve erişim kayıtlarının kendi VDS veya sunucunuzda kalması için yapıldı. KVKK gibi veri gizliliği konusunda hassas kurumlar için gerçekçi bir alternatif olmayı hedefler.

## Üç rol, net sınırlar

| Rol | Ne yapar |
| --- | --- |
| **ADMIN** | Tüm sisteme erişir; kullanıcı, departman ve sistem ayarlarını yönetir |
| **MANAGER** | Kendi departmanının dosya ve klasörlerini yönetir |
| **MEMBER** | Kendi dosyaları ve kendisiyle paylaşılanlarla çalışır |

Klasör ve dosya bazında ayrıca **VIEW / EDIT** izinleri verilir.

## Gerçek arayüzden

![Giriş ve dosya listesi](docs/readme-assets/gif-giris.gif)

| Sürüm geçmişi ve fark | Süreli, limitli, parolalı paylaşım |
| --- | --- |
| ![sürümler](docs/readme-assets/versions-diff.png) | ![paylaşım](docs/readme-assets/share.png) |

| Yönetim paneli | Etkinlik (denetim) günlüğü |
| --- | --- |
| ![admin](docs/readme-assets/admin-users.png) | ![audit](docs/readme-assets/admin-audit.png) |

<sub>Görüntüler yerel bir kurulumda demo verisiyle alındı; kişi ve e-posta bilgileri örnektir.</sub>

## Neler var?

- Klasör ağacı, çoklu yükleme, ZIP yükleme, sürükle-bırak taşıma, çöp kutusu
- **Sürümleme:** aynı adla yüklenen dosya yeni sürüm olur; sürümleri karşılaştır, eskisine dön
- **Paylaşım:** süreli, indirme limitli, parola korumalı genel bağlantılar
- **Denetim kaydı:** kim ne zaman ne yaptı
- Departman ve kullanıcı bazlı depolama kotaları, depolama analitiği
- TOTP ile iki aşamalı doğrulama, hesap kilitleme, sunucu tarafından iptal edilebilen oturumlar
- Dosya adı ve metin/PDF içeriğinde arama, sohbet, sipariş/müşteri modülleri
- İsteğe bağlı OnlyOffice ile tarayıcıda Word/Excel/PowerPoint düzenleme

## Dene

Canlı sistem: **https://cdrive.calapverdi.tr**. Kendi sunucunda kurmak için [Hızlı kurulum](#hızlı-kurulum).

## Hızlı kurulum

Gereksinim: Node.js ≥ 20.9, MySQL/MariaDB.

```bash
git clone https://github.com/macbyclp/cdrive.git && cd cdrive
npm install
# .env: DATABASE_URL, SESSION_SECRET (>=32 karakter), STORAGE_ROOT, APP_URL
npx prisma migrate deploy
npm run dev
```
İlk açılışta kullanıcı yoksa kurulum sihirbazı ilk yöneticiyi oluşturur.

<div align="center"><sub>Verin senin sunucunda. Kontrol senin elinde.</sub></div>

---

Ayrıntılı önceki README: [`docs/README-detailed.md`](docs/README-detailed.md)
