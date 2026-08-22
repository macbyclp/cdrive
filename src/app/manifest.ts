import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/basePath";

/**
 * PWA manifesti — Cdrive'ın telefona "uygulama gibi" kurulabilmesi için.
 *
 * Kod olarak (app/manifest.ts) yazılıyor, statik bir public/manifest.json olarak
 * değil: böylece basePath ("/cdrive") tek bir yerden, NEXT_PUBLIC_BASE_PATH'ten
 * türetiliyor ve basePath değiştiğinde elle güncellenmesi gereken bir dosya kalmıyor.
 *
 * DİKKAT: Next.js manifest içindeki yollara basePath'i OTOMATİK EKLEMİYOR (metadata
 * `manifest` alanına veya `<Link>`e eklediği gibi). Doğrulandı: önek olmadan
 * /icon-192.png 404, /cdrive/icon-192.png 200 dönüyor — yani öneksiz bırakılırsa
 * ikonlar yüklenmez ve uygulama "kurulabilir" sayılmaz. O yüzden withBasePath
 * burada ELLE uygulanıyor.
 *
 * `display: standalone` — açıldığında tarayıcı adres çubuğu görünmez; kenar çubuğu
 * mobil çekmecesiyle (bkz. AppSidebar) birlikte gerçek bir uygulama hissi verir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cdrive — Kurumsal Dosya Yönetimi",
    short_name: "Cdrive",
    description: "Departmanlar arası güvenli dosya paylaşımı, sipariş ve muhasebe yönetimi",
    // Girişten sonra kullanıcıyı doğrudan sürücüye bırak — kök "/" zaten role göre
    // yönlendirme yapıyor ama tek adım fazla.
    start_url: withBasePath("/drive"),
    // scope, uygulamanın "içi" sayılan yol — basePath'in kendisi olmalı ki
    // /cdrive dışına çıkan bir link tarayıcıda açılsın.
    scope: withBasePath("/"),
    display: "standalone",
    orientation: "portrait-primary",
    lang: "tr",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    categories: ["business", "productivity"],
    icons: [
      { src: withBasePath("/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBasePath("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      // Android'in ikonu daire/kare/damla gibi şekillere kırpabilmesi için ayrı,
      // kenar boşluğu daha geniş bir sürüm.
      { src: withBasePath("/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
