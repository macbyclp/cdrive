import type { NextConfig } from "next";

// Cdrive, calapverdi.tr'nin KÖKÜNDE değil "/cdrive" alt-yolunda barınıyor
// (cPanel Node.js App "Application URL" alanına calapverdi.tr/cdrive girildi).
// basePath olmadan tüm statik dosya/API istekleri "/api/..." gibi köke gider
// ve 404 alırsınız — Next.js bunları otomatik "/cdrive/api/..." yapar.
// Ortam değişkeniyle kapatılabilir (basePath istemeyen bir kuruluma geçilirse).
const basePath = process.env.NEXT_BASE_PATH ?? "/cdrive";

const nextConfig: NextConfig = {
  basePath,
  // src/lib/basePath.ts (istemci tarafı fetch/window.open/href sarmalayıcısı)
  // basePath'i process.env.NEXT_PUBLIC_BASE_PATH üzerinden okuyor — basePath
  // "NEXT_PUBLIC_" önekiyle başlamadığı için Next.js'in otomatik client-env
  // inline mekanizması onu görmez, bu yüzden burada elle expose ediyoruz.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
