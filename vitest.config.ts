import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Entegrasyon testleri gerçek (ayrı) bir MySQL test veritabanına karşı
    // çalışır — bkz. .env.test. Testler seri (paralel olmayan dosyalar
    // arası izolasyon garantisi için tek fork) çalıştırılır.
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    testTimeout: 15_000,
    // `next build` (output: "standalone") tüm proje ağacını .next/standalone altına
    // kopyalıyor — testler dahil. Varsayılan exclude listesi .next'i kapsamadığı için
    // her test DOSYASI İKİ KEZ toplanıyordu: bir kaynaktan, bir de build çıktısındaki
    // eski kopyasından. Bu hem test sayısını şişiriyor (7 dosya/75 test -> 14/150) hem
    // de daha kötüsü, kaynakta düzeltilmiş bir testin build çıktısındaki BAYAT
    // kopyasının çalışmasına yol açıyor. Varsayılanları koruyup .next'i ekliyoruz.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
