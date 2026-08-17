# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Küçük-orta ölçekli şirketlerin çalışanları ve yöneticileri. Üç rol: **ADMIN** (tüm sisteme erişir,
kullanıcı/departman yönetir, sistem ayarlarını yapılandırır), **MANAGER** (kendi departmanının tüm
dosya/klasörlerini yönetir), **MEMBER** (kendi dosyaları + kendisiyle paylaşılanlar). Kullanım
senaryosu: departmanlar arası dosya paylaşımı, ortak belge üzerinde çalışma, dış paydaşlara
kontrollü (süreli/şifreli) paylaşım.

## Product Purpose

Kurumsal dosya yönetim platformu — bir şirketin kendi sunucusunda (self-hosted) çalışan,
departman/rol tabanlı erişim kontrolüne sahip, Google Drive/Dropbox'a benzer bir dosya paylaşım ve
işbirliği aracı. Başarı: bir çalışanın doğru dosyaya doğru izinle, hızlıca ulaşabilmesi; bir
yöneticinin kimin neye eriştiğini görebilmesi ve kontrol edebilmesi.

## Positioning

**Kendi sunucusunda barındırma + tam veri kontrolü** — kurumsal veriler şirketin kendi
VDS/hosting'inde kalır, üçüncü parti bulut sağlayıcıya (Google, Dropbox, Microsoft) bağımlı
değildir. Bu, veri egemenliği/gizlilik konusunda hassas kurumlar (ör. KVKK kapsamındaki şirketler)
için komşu SaaS ürünlerinin gerçekçi şekilde sunamayacağı bir konum.

## Operating Context

Şirket içi, departmanlara ayrılmış bir organizasyon. Kullanıcılar tarayıcıdan erişir (masaüstü ve
mobil web). Admin, ayrı bir yönetim panelinden kullanıcı/departman/depolama kotası/sistem
politikalarını yönetir. Belgeler isteğe bağlı olarak ayrı bir VDS'te çalışan OnlyOffice Document
Server'a bağlanarak tarayıcıda gerçek zamanlı düzenlenebilir (Word/Excel/PowerPoint). Sistem Docker
container'larında (Next.js + MySQL) bir VDS'te barınıyor, isteğe bağlı olarak cPanel paylaşımlı
hosting'de de çalışabilir (basePath desteğiyle bir alt-yolda).

## Capabilities and Constraints

- Rol tabanlı erişim (ADMIN/MANAGER/MEMBER) + klasör/dosya bazında açık izin verme (VIEW/EDIT).
- İç içe klasörler, çoklu dosya yükleme, sürükle-bırak taşıma, versiyon geçmişi, çöp kutusu
  (yapılandırılabilir otomatik temizleme politikasıyla).
- Kullanıcı ve departman bazlı depolama kotası; admin tarafından ayarlanabilen dosya
  boyutu/uzantısı politikaları.
- Süre/indirme limiti/şifre korumalı genel paylaşım bağlantıları.
- Dosya adına ve (metin/PDF) içeriğine göre tam metin arama.
- Boş Word/Excel/PowerPoint belgesi oluşturma ve (OnlyOffice varsa) docx/xlsx/pptx→PDF dönüştürme.
- Video/müzik dosyaları tarayıcıda doğrudan oynatılabiliyor; ayrı bir "Medya" galeri görünümü var.
- Güvenlik: TOTP tabanlı 2FA, başarısız girişte hesap kilitleme, DB destekli oturum yönetimi
  (kullanıcı kendi hesap ayarlarından uzak oturumları sonlandırabilir).
- Teknik: Next.js (App Router) + Prisma + MySQL; OnlyOffice entegrasyonu opsiyonel (ayrı bir
  Document Server VDS'i gerektirir, yoksa ilgili özellikler sessizce gizlenir/kapatılır).

## Evidence on Hand

Uygulama şu an gerçek bir üretim ortamında canlı çalışıyor (kendi VDS'inde, Docker ile,
`cdrive.calapverdi.tr` ve `office.calapverdi.tr` alan adlarında). Gerçek müşteri/vaka çalışması,
tanıklık veya basın kanıtı yok — bunlar üretilmemeli/uydurulmamalı.

## Product Principles

1. **Veri egemenliği önce gelir** — kurumun kendi altyapısında, üçüncü tarafa veri sızdırmadan çalışmak temel vaat.
2. **Rol/departman disiplini kazayı önler** — yanlış kişiye yanlışlıkla erişim verilmesi tasarımca zorlaştırılmalı, kolaylaştırılmamalı.
3. **Tanıdıklık hız kazandırır** — Google Drive/Dropbox kullanmış birinin hiç öğrenmeden kullanabileceği bir zihinsel model.
4. **Şeffaf denetlenebilirlik** — admin, sistemde olan biteni (kim ne yaptı) her zaman görebilmeli.
5. **Kritik işlemler geri alınabilir** — silme çöp kutusuna gider, versiyonlar saklanır; kazara veri kaybı tasarımca engellenir.
