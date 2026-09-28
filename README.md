<div align="center">

<img src="public/icon-192.png" width="84" alt="CDrive logo" />

# CDrive

### Kurumsal dosyalarınız. Kendi sunucunuzda. Tam kontrolünüzde.

Departman, rol ve izin temelli **self-hosted** dosya yönetimi ve işbirliği platformu.
Google Drive rahatlığı, ama veri sizin diskinizde — şimdi **Liquid Glass** arayüzü ve iOS PWA uyumuyla.

[![Canlı](https://img.shields.io/badge/canlı-cdrive.calapverdi.tr-0d0e12?style=for-the-badge)](https://cdrive.calapverdi.tr)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Prisma](https://img.shields.io/badge/Prisma-MySQL%2FMariaDB-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-iOS%20uyumlu-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Self-hosted](https://img.shields.io/badge/self--hosted-evet-16a34a?style=for-the-badge)

<img src="docs/readme-assets/ui-after/03-drive-desktop-light.jpg" alt="CDrive — Liquid Glass sürücü görünümü" width="820" />

</div>

---

## Önce / Sonra

Arayüz baştan tasarlandı ([#15](https://github.com/macbyclp/cdrive/pull/15)). Aynı sayfalar, aynı veri; yalnızca görünüm ve etkileşim değişti.

| | Önce | Sonra |
| --- | --- | --- |
| **Sürücü** (açık) | <img src="docs/readme-assets/ui-before/03-drive-desktop-light.jpg" alt="Önce: sürücü, açık tema" /> | <img src="docs/readme-assets/ui-after/03-drive-desktop-light.jpg" alt="Sonra: sürücü, açık tema" /> |
| **Sürücü** (koyu) | <img src="docs/readme-assets/ui-before/02-drive-desktop-dark.jpg" alt="Önce: sürücü, koyu tema" /> | <img src="docs/readme-assets/ui-after/02-drive-desktop-dark.jpg" alt="Sonra: sürücü, koyu tema" /> |
| **Genel bakış** | <img src="docs/readme-assets/ui-before/04-panel-genel-bakis-light.jpg" alt="Önce: genel bakış" /> | <img src="docs/readme-assets/ui-after/04-panel-genel-bakis-light.jpg" alt="Sonra: genel bakış" /> |
| **Yönetim paneli** | <img src="docs/readme-assets/ui-before/05-admin-desktop-light.jpg" alt="Önce: yönetim paneli" /> | <img src="docs/readme-assets/ui-after/05-admin-desktop-light.jpg" alt="Sonra: yönetim paneli" /> |
| **Giriş** (koyu) | <img src="docs/readme-assets/ui-before/01-login-desktop-dark.jpg" alt="Önce: giriş" /> | <img src="docs/readme-assets/ui-after/01-login-desktop-dark.jpg" alt="Sonra: giriş" /> |
| **Telefon** (375 px) | <img src="docs/readme-assets/ui-before/06-drive-mobile-375-light.jpg" alt="Önce: telefon" width="240" /> | <img src="docs/readme-assets/ui-after/06-drive-mobile-375-light.jpg" alt="Sonra: telefon" width="240" /> |

<sub>Görüntüler yerel bir kurulumda demo verisiyle alındı. Önce: düz indigo/mor tema, telefonda taşan araç çubuğu. Sonra: nötr Liquid Glass, yüzen cam paneller, iOS alt sekme çubuğu.</sub>

### Liquid Glass neleri getirdi?

- **Nötr cam dili:** gri-beyaz-siyah palet, buzlu cam yüzeyler ve zeminde yavaş süzülen ışık lekeleri; açık ve koyu tema.
- **Su efekti:** fare düğme, kart ve satırların üstündeyken ışık halkaları su gibi dalgalanır; tıklamada dalga çıkar; zeminde fareyi yumuşakça izleyen bir dalga vardır. Tema menüsündeki *Su efekti ve hareket* anahtarıyla açılıp kapanır (Sistem: işletim sisteminin "hareketi azalt" ayarını izler).
- **iOS PWA uyumu:** safe-area (çentik / home bar), şeffaf durum çubuğu, telefonda alt sekme çubuğu, alttan açılan menü ve diyalog sayfaları (bottom sheet), 16 px girdiler (zoom yok), ≥ 44 px dokunma hedefleri.
- **Erişilebilirlik:** *saydamlığı azalt* camı daha opak yapar, *hareketi azalt* efektleri kapatabilir; `backdrop-filter` desteği yoksa opak yedek görünüm.
- **Seçilebilir görünümler:** Liquid Glass varsayılandır; eski *Modern* ve *Kurumsal Arşiv* görünümleri yönetim panelinden (Sistem ayarları → Arayüz görünümü) seçilebilir. Ayrıntı: [`DESIGN.md`](DESIGN.md).

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

## Neler var?

**Dosyalar**
- Klasör ağacı, çoklu yükleme, ZIP yükleme, sürükle-bırak taşıma, kopyalama, çöp kutusu, yıldızlı ve son kullanılanlar
- **Sürümleme:** aynı adla yüklenen dosya yeni sürüm olur; sürümleri karşılaştır, eskisine dön
- **Belge tara:** kamera veya fotoğraflardan sayfa topla → filtre (Orijinal / Belge / Siyah-beyaz) → tek PDF. İsteğe bağlı OCR ile içerik araması ve **düzenlenebilir Word (.docx)** çıktısı ([#14](https://github.com/macbyclp/cdrive/pull/14))
- Dosya adı ve metin/PDF içeriğinde arama, etiketler, yorumlar, onay akışları
- İsteğe bağlı OnlyOffice ile tarayıcıda Word/Excel/PowerPoint düzenleme

**Yönetim**
- Yönetim panelinden **SSH'siz uzaktan güncelleme** (yedek + otomatik geri dönüş)

**Paylaşım ve güvenlik**
- Süreli, indirme limitli, parola korumalı genel bağlantılar
- **Denetim kaydı:** kim ne zaman ne yaptı
- TOTP ile iki aşamalı doğrulama, hesap kilitleme, sunucu tarafından iptal edilebilen oturumlar
- Departman ve kullanıcı bazlı depolama kotaları, depolama analitiği

**İşbirliği ve iş modülleri**
- Kurum içi sohbet (kanallar ve birebir), bildirimler
- Sipariş, müşteri, muhasebe ve üretim modülleri; raporlar

## Hızlı kurulum

Gereksinim: **Node.js ≥ 20.9** ve **MySQL / MariaDB**.

```bash
git clone https://github.com/macbyclp/cdrive.git && cd cdrive
npm install
cp .env.example .env   # değerleri düzenle (aşağıya bak)
npx prisma migrate deploy
npm run dev            # http://localhost:3000
```

Minimum `.env`:

```env
DATABASE_URL="mysql://KULLANICI:SIFRE@127.0.0.1:3306/cdrive"
SESSION_SECRET="en-az-32-karakterlik-rastgele-bir-anahtar"
STORAGE_ROOT="./storage"
NEXT_BASE_PATH=""          # kökte barındırıyorsan boş; alt yolda ise örn. "/cdrive"
```

İlk açılışta kullanıcı yoksa kurulum sihirbazı ilk yöneticiyi oluşturur. Üretimde `SESSION_SECRET` zorunludur. OnlyOffice, SMTP, cron ve yedek dizini gibi isteğe bağlı ayarlar için [`.env.example`](.env.example) dosyasına bak.

### Üretim

```bash
npm run build && npm start
```

Docker/VDS için [`Dockerfile`](Dockerfile) ve [`deploy/vds`](deploy/vds) altındaki `docker-compose.yml` kullanılır; cPanel/Passenger için kökteki `server.js` hazırdır.

### SSH'siz uzaktan güncelleme

VDS'e Docker ile kurduğunuzda, sonraki güncellemeler için sunucuya girmeniz gerekmez: **Yönetim → Güncelleme** sekmesi GitHub'daki yeni sürümü gösterir, **Şimdi güncelle** ise veritabanı yedeği alır, yeni sürümü derler, yeniden başlatır ve sağlıklı açılmazsa otomatik olarak eskisine döner. Kurulum ve güvenlik ayrıntıları: [`deploy/vds/README.md`](deploy/vds/README.md).

> **iPhone'da PWA:** "Ana Ekrana Ekle" için HTTPS önerilir; kamera (Belge tara) yalnızca HTTPS veya `localhost` üzerinde açılır.

## Geliştirme

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run typecheck` | Tip kontrolü |
| `npm run lint` | ESLint |
| `npm test` | Vitest (birim + entegrasyon) |
| `npm run migrate` | `prisma migrate deploy` |

Proje yapısı: `src/app` (sayfalar ve API rotaları), `src/components`, `src/lib`, `prisma` (şema ve migration'lar), `messages` (i18n), `tests`, `deploy`.

## Belgeler

- [`DESIGN.md`](DESIGN.md) — tasarım sistemi (Liquid Glass ve Kurumsal Arşiv)
- [`PRODUCT.md`](PRODUCT.md) — ürün amacı, kullanıcılar, konumlandırma
- [`docs/README-detailed.md`](docs/README-detailed.md) — önceki, ayrıntılı README (eski arayüz ekran görüntüleriyle)

## Canlı örnek

**https://cdrive.calapverdi.tr**

<div align="center"><sub>Verin senin sunucunda. Kontrol senin elinde.</sub></div>
