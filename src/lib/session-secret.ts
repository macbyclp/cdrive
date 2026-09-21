// Oturum/JWT imza anahtarı. Üretimde SESSION_SECRET zorunlu ve >= 32 karakter olmalı;
// aksi halde süreç başlangıçta hata verir (herkesçe bilinen sabit anahtarla sessizce
// çalışmak yerine). `next build` aşamasında ve geliştirmede eski varsayılan kullanılır.
const DEV_FALLBACK = "insecure-dev-secret-change-me";

export function resolveSecret(primary?: string): string {
  const value = primary ?? process.env.SESSION_SECRET;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuild) {
    if (!value || value.length < 32) {
      throw new Error("SESSION_SECRET üretimde zorunludur ve en az 32 karakter olmalıdır.");
    }
  }
  return value ?? DEV_FALLBACK;
}
