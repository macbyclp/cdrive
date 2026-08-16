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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
