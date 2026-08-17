---
name: Cdrive — Kurumsal Arşiv Dosya Dolabı
description: Sürücü sayfası için opsiyonel alternatif görsel dünya — kraft kağıt, pirinç vurgu ve asma dosya sekmeleri.
colors:
  kraft-zemin: "#eee7d6"
  kraft-zemin-koyu: "#1c1a14"
  yuzey: "#f6f1e4"
  yuzey-koyu: "#26221a"
  pirinç-vurgu: "#7a6a2e"
  pirinç-vurgu-koyu: "#c9a961"
  metin-birincil: "#2b2620"
  metin-birincil-koyu: "#e6ddc7"
  metin-ikincil: "#5c5340"
  sinir: "#b7a983"
  tehlike: "#8b2f1f"
  basari: "#3d5c2e"
rounded:
  sm: "0.5rem"
  md: "0.625rem"
  lg: "0.875rem"
components:
  klasor-sekmesi:
    backgroundColor: "{colors.pirinç-vurgu}"
    rounded: "{rounded.sm}"
---

# Design System: Cdrive — Kurumsal Arşiv Dosya Dolabı

> **Not:** Bu, Cdrive'ın TEK görsel sistemi değil — mevcut "Modern" tema (indigo/mor, düz kartlar,
> `src/app/globals.css`'in `:root`/`[data-theme="dark"]` blokları) silinmedi, hâlâ varsayılan ve
> tamamen çalışır durumda. Bu dosya SADECE admin panelinden ("Sistem ayarları → Arayüz görünümü")
> açılabilen, `[data-skin="archive"]` ile etkinleşen alternatif dünyayı belgeler. İki sistem
> aynı anda var olur; bu dosyanın kuralları `[data-skin="archive"]` kapsamı dışına taşınmamalı.

## Overview

**Creative North Star: "Kurumsal Arşiv Dosya Dolabı"**

Sürücü sayfası, çekmeceleri açılıp kapanan gerçek bir kurumsal arşiv dosya dolabı gibi davranır —
her klasör bir asma dosya, üstündeki küçük pirinç sekme (tab) onu diğer dosyalardan ayırır. Bu
dünya, kategori varsayılanı olan "jenerik SaaS dashboard"ı (beyaz kart + tek marka rengi + sistem
fontu) bilerek reddeder ve onun yerine ofis arşivciliğinin somut, dokunsal malzemesini
(kraft kağıt, pirinç/bakır donanım) seçer. Impeccable'ın karar sürecinde zar "Banka Kasası &
Güvenlik Odası"nı önerdi; kullanıcı bunun yerine kendi "IMPECCABLE'S PICK" kartı olan bu dünyayı
seçti — daha az soyut, günlük ofis deneyimine daha yakın bulundu.

**Key Characteristics:**
- Sıcak, kraft-kağıt zemin (açık modda) / koyu zeytin-kahve zemin (koyu modda) — asla nötr gri değil.
- Tek vurgu rengi pirinç/bakırdır, marka rengi olarak indigo/mor değil.
- Klasörler üstte kesik bir "asma dosya sekmesi" çıkıntısıyla ayırt edilir.
- Dosyalar sekme almaz — sadece klasörler (departman/kategori metaforu klasörlere ait).

## Colors

Palet karakteri: sıcak, kağıt-temelli, düşük doygunluklu — hiçbir yerde saf beyaz veya parlak
mavi/mor yok, hepsi "kağıt ve pirinç" ailesinden.

### Primary
- **Pirinç Vurgu** (`#7a6a2e` açık modda, `#c9a961` koyu modda): Birincil eylem butonları, aktif
  sekme göstergeleri, seçili durum arka planları, klasör sekmesi çıkıntısının rengi.

### Neutral
- **Kraft Zemin** (`#eee7d6` açık / `#1c1a14` koyu): Sayfa arka planı.
- **Yüzey** (`#f6f1e4` açık / `#26221a` koyu): Kart/panel/liste satırı arka planı.
- **Yüzey (hover)** (`#ddd2b5` açık / `#3a3426` koyu): Hover durumundaki satır/kart arka planı.
- **Kenar Çizgisi** (`#b7a983` açık / `#4a4230` koyu): Kart kenarlıkları, ayraç çizgileri.
- **Metin Birincil** (`#2b2620` açık / `#e6ddc7` koyu): Başlıklar, dosya/klasör adları.
- **Metin İkincil** (`#5c5340` açık / `#b7a983` koyu): Tarih, boyut, yardımcı metin.

### Named Rules
**The One Warm Family Rule.** Her renk (zemin, yüzey, metin, vurgu) aynı sıcak kraft/pirinç renk
ailesinden gelir — sistem paletindeki soğuk mavi/mor hiçbir zaman archive modunda görünmez.

## Typography

Bu dünya kendi yazı tipi ailesini seçmedi — proje genelindeki Geist Sans/Mono yığını (`--font-sans`,
`--font-geist-sans`) korunuyor. Tip karakterinin farkı ağırlık/hiyerarşi değil, **renk** ve
**malzeme** ile kuruluyor; bu bilinçli bir seçim (karar turunda tip değişikliği talep edilmedi).

## Layout

Mevcut "Modern" temanın grid/spacing sistemini birebir devralır: sol sidebar (sabit genişlik),
üstte arama+kullanıcı barı, ana alanda liste ya da ızgara (grid) görünümü — bu yapı `[data-skin]`'e
göre değişmiyor. Archive dünyası SADECE renk token'larını ve klasör görünümünü değiştiriyor, hiçbir
DOM yapısını/breakpoint'i değiştirmiyor.

## Elevation & Depth

Modern temayla aynı gölge sözlüğünü paylaşır (`--shadow-sm/md/lg`), sadece gölgenin rengi zemin
rengine göre otomatik ayarlanır (`rgb(43 38 32 / ...)` — kraft zemine göre ısıtılmış siyah, sistem
temasının soğuk `rgb(15 23 42 / ...)` yerine).

### Named Rules
**The Warm Shadow Rule.** Bir gölge her zaman zeminin renk ailesinden türetilir; archive modunda
hiçbir gölge saf/soğuk siyah olamaz.

**Zemin dokusu:** `--paper-texture` — SVG `feTurbulence` ile üretilmiş, %5 opaklıkta gri-tonlama
noise, data-URI olarak inline (harici dosya/ağ isteği yok). `[data-skin="archive"]` kök
elementinin ve klasör sekmesinin `background-image`'i olarak uygulanır — zemin düz bir renk kodu
değil, gerçekten pürüzlü bir kağıt yüzeyi.

## Shapes

Form dili modern temadan bilinçli olarak AYRILIYOR — ilk sürümde sadece renk değişmişti (gerçek
kullanıcı geri bildirimiyle düzeltildi, bkz. Don't listesi). Kart/buton/input köşe yarıçapı
`0.25rem`'e düşürüldü (modern temanın `0.625rem`/`0.875rem`'ine karşı) — kağıt/dosya nesnesinin
keskin köşesi, ekranın yumuşak "app" köşesi değil.

### Named Rules
**The Sharp Paper Rule.** Archive dünyasında hiçbir yüzey modern temanın yuvarlak köşesini
(`≥0.5rem`) taşımaz; en fazla `0.25rem`.

### Klasör sekmesi (imza şekli)
`.archive-tab::before` pseudo-element'i: gerçek bir manila klasör sekmesinin siluetini taşıyan,
üstten eğik kesilmiş bir trapezoid (`clip-path: polygon(8% 100%, 22% 0, 78% 0, 92% 100%)`),
3rem genişlik, 0.75rem yükseklik, kart/satırın sol üst köşesinden 0.6rem taşıyor. Pirinç vurgu
rengi + kağıt dokusu (`--paper-texture`) — düz dikdörtgen bir renk bloğu DEĞİL, dokulu bir yüzey.
Sadece klasörlerde (dosyalarda değil) — "asma dosya" metaforu kategori/klasör kavramına ait.

## Components

### Klasör simgesi (FolderGlyph — imza bileşeni)
Modern temadaki 📁 emojisinin yerini, archive modunda özel çizilmiş bir SVG alır
(`src/app/drive/page.tsx`, `FolderGlyph` fonksiyonu): manila klasör siluetini andıran bir gövde
(`var(--accent-soft)` dolgu, `var(--accent)` kontur) + üstte belirgin bir sekme çıkıntısı
(`var(--accent)`, %55 opaklık). Liste görünümünde 20px, ızgara görünümünde 40px. Bu, "sadece
renk paleti değişti" izlenimini kıran en somut karar — ikon emoji değil, gerçek bir çizim.

### Klasör satırı/kartı
- **Şekil:** `0.25rem` köşe yarıçapı (bkz. The Sharp Paper Rule) + üstte `.archive-tab` sekmesi.
- **Arka plan:** Yüzey rengi (kraft/koyu zeytin) + kağıt dokusu.
- **Hover:** Kenarlık pirinç vurguya döner, gölge belirir (mevcut sistemle aynı davranış).

### Butonlar / Kartlar / Girdiler
Mevcut sistemin `.btn-primary`/`.btn-secondary`/`.card`/`.input` sınıflarını olduğu gibi kullanır
— bu sınıflar zaten CSS custom property'lere bağlı olduğu için `[data-skin="archive"]` altında
otomatik olarak yeni palete geçer, ayrı bir archive-özel bileşen tanımına gerek kalmadı.

## Do's and Don'ts

### Do:
- **Do** yeni bir klasör/dosya bileşeni eklerken CSS custom property'leri (`var(--accent)`,
  `var(--surface)` vb.) kullan — böylece hem modern hem archive temasında otomatik doğru render olur.
- **Do** klasöre özgü görsel vurguları (`.archive-tab` gibi) sadece klasörlere uygula, dosyalara
  sızdırma — metafor ayrımı (dosya dolabı çekmecesi = klasör, içindeki kağıt = dosya) korunmalı.

### Don't:
- **Don't** archive paletini modern temanın varsayılan renkleri olarak taşıma — ikisi ayrı,
  kullanıcı admin panelinden seçilebilir kalmalı (bkz. PRODUCT.md, bu kullanıcının açık kararıydı).
- **Don't** `[data-theme="dark"][data-skin="archive"]` gibi "aynı eleman" seçicisi yazma —
  `data-theme` `<html>`'de, `data-skin` Sürücü sayfasının kendi wrapper'ında ayrı elementlerdir;
  doğrusu torun seçicisi `[data-theme="dark"] [data-skin="archive"]` (bu proje bu hatayı bir kez
  yapıp gerçek tarayıcıda yakaladı — bkz. günlük).
- **Don't** sarı/pirinç vurguyu %10'dan fazla bir yüzeyde düz dolgu olarak kullanma — vurgu rengi
  sekmeler, butonlar ve aktif durumlarla sınırlı kalmalı, zemin asla pirinç renginde olmamalı.
