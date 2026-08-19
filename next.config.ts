import type { NextConfig } from "next";

// Cdrive, calapverdi.tr'nin KÖKÜNDE değil "/cdrive" alt-yolunda barınıyor
// (cPanel Node.js App "Application URL" alanına calapverdi.tr/cdrive girildi).
// basePath olmadan tüm statik dosya/API istekleri "/api/..." gibi köke gider
// ve 404 alırsınız — Next.js bunları otomatik "/cdrive/api/..." yapar.
// Ortam değişkeniyle kapatılabilir (basePath istemeyen bir kuruluma geçilirse).
const basePath = process.env.NEXT_BASE_PATH ?? "/cdrive";

const nextConfig: NextConfig = {
  basePath,
  // VDS/Docker deploy'unda (bkz. deploy/vds/) Dockerfile bu çıktıyı kullanır —
  // sadece gerekli node_modules'i içeren küçük, bağımsız bir server.js üretir.
  // cPanel/Passenger deploy'unu (kendi server.js'imiz) ETKİLEMEZ, sadece ekstra
  // bir çıktı klasörüdür (.next/standalone).
  output: "standalone",
  // pdfkit runtime'da kendi .afm font veri dosyalarını __dirname'e göreli bir yoldan
  // okuyor — Next.js'in normal server bundling'i bu dosyaları paketlemeyip yolu
  // bozuyor ("ENOENT ...pdfkit/js/data/Helvetica.afm", gerçek deploy'da yakalandı).
  // Bu paketi bundle'lamayıp normal node_modules çözümlemesine bırakmak düzeltiyor.
  // pdfjs-dist da dışlanıyor: sunucu tarafında PDF metin çıkarımı için kullanılıyor
  // (bkz. src/lib/text-extract.ts) ve kendi "worker" dosyasını (pdf.worker.mjs)
  // çalışma zamanında dinamik olarak çözümlemeye çalışıyor — Next'in bundler'ı bu
  // yolu paketleyince "Setting up fake worker failed: Cannot find module ..." ile
  // patlıyor; dışlanınca Node'un normal node_modules çözümlemesine bırakılıyor.
  serverExternalPackages: ["pdfkit", "pdfjs-dist"],
  // src/lib/basePath.ts (istemci tarafı fetch/window.open/href sarmalayıcısı)
  // basePath'i process.env.NEXT_PUBLIC_BASE_PATH üzerinden okuyor — basePath
  // "NEXT_PUBLIC_" önekiyle başlamadığı için Next.js'in otomatik client-env
  // inline mekanizması onu görmez, bu yüzden burada elle expose ediyoruz.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
