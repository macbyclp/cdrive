import { getRequestConfig } from "next-intl/server";

// Şimdilik tek dil (tr) — ileride ek dil eklenirse burada Accept-Language veya
// kullanıcı tercihine göre locale seçimi yapılabilir; messages/<locale>.json
// eklemek yeterli olur, sayfa/bileşen kodu değişmez.
export default getRequestConfig(async () => {
  const locale = "tr";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
