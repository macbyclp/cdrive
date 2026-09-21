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
  async headers() {
    // CSP varsayılan olarak Report-Only: OnlyOffice iframe/script istisnaları canlıda doğrulanmadan
    // zorlanmaz. Doğruladıktan sonra CSP_ENFORCE=1 ile (DERLEME zamanında: Dockerfile build-arg CSP_ENFORCE) aynı politika ZORLANIR;
    // kod değişikliği gerekmez, geri almak için değişkeni kaldırmak yeter. Diğer başlıklar doğrudan uygulanır.
    const cspHeader = process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
    const office = process.env.ONLYOFFICE_URL ?? "";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${office}`.trim(),
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      `connect-src 'self' ${office}`.trim(),
      `frame-src 'self' ${office}`.trim(),
      "frame-ancestors 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
          { key: cspHeader, value: csp },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
