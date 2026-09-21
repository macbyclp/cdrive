<div align="center">
  <img src="public/icon-192.png" width="88" alt="CDrive logo" />
  <h1>CDrive</h1>
  <p><strong>Kurumsal dosyalarınız. Kendi sunucunuzda. Tam kontrolünüzde.</strong></p>
  <p>Departman, rol ve izin temelli; modern, self-hosted dosya yönetimi ve işbirliği platformu.</p>

  [![Live](https://img.shields.io/badge/live-cdrive.calapverdi.tr-6C63FF?style=for-the-badge)](https://cdrive.calapverdi.tr)
  ![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
  ![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![MySQL](https://img.shields.io/badge/MySQL-Prisma-23395D?style=for-the-badge&logo=mysql&logoColor=white)
  ![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
</div>

![CDrive — private cloud, visualized](docs/assets/cdrive-hero.png)

<div align="center">
  <a href="https://cdrive.calapverdi.tr"><strong>Canlı sistemi aç</strong></a>
  ·
  <a href="#öne-çıkanlar">Özellikler</a>
  ·
  <a href="#hızlı-kurulum">Kurulum</a>
  ·
  <a href="#mimari">Mimari</a>
</div>

---

## Neden CDrive?

CDrive, kurumsal dosyaları üçüncü taraf bir buluta teslim etmeden Drive benzeri bir deneyim sunar. Veriler sizin diskinizde, yetki politikaları sizin veritabanınızda ve bütün servisler sizin altyapınızda çalışır.

<p align="center">
  <img src="docs/assets/cdrive-demo.gif" width="900" alt="CDrive canlı giriş ekranı" />
</p>

## Öne çıkanlar

| | Yetenek | Ne sağlar? |
|---|---|---|
| 🗂️ | Dosya ve klasör yönetimi | Çoklu yükleme, sürükle-bırak, taşıma, ZIP indirme ve medya önizleme |
| 🛡️ | Rol tabanlı erişim | Admin, yönetici ve üye rolleri; departman ve öğe bazlı izinler |
| 🔗 | Güvenli paylaşım | Süreli, indirme limitli ve parola korumalı genel bağlantılar |
| 🕓 | Versiyon geçmişi | Önceki sürümlere dönme, karşılaştırma ve geri alınabilir silme |
| 🔎 | İçerik arama | Dosya adı yanında metin ve PDF içeriğinde yetki filtreli arama |
| 📝 | Office entegrasyonu | OnlyOffice ile Word, Excel ve PowerPoint belgelerini tarayıcıda düzenleme |
| 💬 | Ekip çalışması | Yorumlar, onay akışları, bildirimler ve gerçek zamanlı sohbet |
| 📊 | Operasyon paneli | Kota, depolama, kullanıcı, departman ve denetim günlüğü yönetimi |

## Ürün yaklaşımı

> **Veri egemenliği önce gelir.** CDrive; kurumların dosyalarını, kullanıcılarını ve erişim kayıtlarını kendi VDS veya sunucularında tutması için geliştirildi.

- TOTP tabanlı iki aşamalı doğrulama
- IP bazlı hız sınırlama ve hesap kilitleme
- Sunucu tarafından iptal edilebilen oturumlar
- Geri alınabilir silme ve yapılandırılabilir veri saklama
- Kullanıcı ve departman bazlı depolama kotaları
- Denetlenebilir yönetici işlemleri ve kimliğe bürünme kayıtları

## Mimari

```mermaid
flowchart LR
    U[Tarayıcı / PWA] --> N[Next.js 16]
    N --> A[API + Yetki Katmanı]
    A --> P[Prisma ORM]
    P --> M[(MySQL / MariaDB)]
    A --> S[(Yerel Dosya Deposu)]
    A --> O[OnlyOffice Document Server]
    C[Caddy / HTTPS] --> N
    C --> O
```

## Teknoloji

`Next.js 16` · `React 19` · `TypeScript` · `Tailwind CSS 4` · `Prisma` · `MySQL/MariaDB` · `Vitest` · `Docker` · `OnlyOffice`

## Hızlı kurulum

### Docker ile

```bash
git clone https://github.com/macbyclp/cdrive.git
cd cdrive/deploy/vds
# docker-compose.yml içindeki replace-with-* değerlerini değiştirin
docker compose up -d --build
```

### Yerel geliştirme

```bash
git clone https://github.com/macbyclp/cdrive.git
cd cdrive
npm install
npx prisma migrate deploy
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılır. İlk çalıştırmada henüz kullanıcı yoksa kurulum sihirbazı ilk yöneticiyi oluşturur.

### Temel ortam değişkenleri

```dotenv
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/cdrive
SESSION_SECRET=replace-with-a-long-random-value
STORAGE_ROOT=./storage
APP_URL=https://drive.example.com
```

OnlyOffice kullanacaksanız ayrıca `ONLYOFFICE_URL` ve `ONLYOFFICE_JWT_SECRET` tanımlayın. Üretim sırlarını hiçbir zaman repoya eklemeyin.

## Test ve kalite

```bash
npm run lint
npm test
npm run build
```

Test paketi; erişim hesaplama, onay akışları, sohbet, siparişler, raporlar, oturum ömrü, paylaşım ve TOTP gibi kritik alanları kapsar. Entegrasyon testleri yalnızca ayrı bir test veritabanında çalıştırılmalıdır.

## Proje haritası

```text
src/app/          Sayfalar ve REST API uçları
src/components/   Arayüz ve iş akışı bileşenleri
src/lib/          Yetki, güvenlik, depolama ve servis katmanı
prisma/           Veri modeli ve migration'lar
deploy/           VDS ve OnlyOffice Docker tanımları
tests/            Birim ve entegrasyon testleri
```

## Dağıtım

- **VDS / Docker:** Önerilen üretim yolu; Next.js, MySQL ve depolama kalıcı volume'larla çalışır.
- **cPanel:** Node.js App + MySQL ile desteklenir; düşük bellek limitlerinde build işlemi VDS üzerinde yapılmalıdır.
- **OnlyOffice:** Ayrı Document Server servisi olarak opsiyoneldir; kapalı olduğunda ilgili özellikler arayüzden gizlenir.

## Durum

CDrive gerçek bir üretim ortamında çalışmaktadır: [cdrive.calapverdi.tr](https://cdrive.calapverdi.tr). Proje aktif olarak geliştirilen kişisel/self-hosted bir üründür; henüz genel SaaS hizmeti veya müşteri referansı iddiası taşımaz.

## Lisans

Bu proje [LICENSE](LICENSE) dosyasındaki koşullar altında sunulur.

---

<div align="center">
  <sub>Verin senin sunucunda. Kontrol senin elinde.</sub>
</div>
