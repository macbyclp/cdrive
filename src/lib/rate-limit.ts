// Basit bellek-içi sabit pencereli (fixed window) hız sınırlayıcı. Tek Node
// sürecinde çalışan bu uygulama için yeterli; süreç yeniden başlayınca sıfırlanır
// (kalıcı kilitleme User.lockedUntil ile ayrıca DB'de tutuluyor, bkz. lib/auth.ts).
const buckets = new Map<string, { count: number; resetAt: number }>();

// Bellek sızıntısını önlemek için süresi geçmiş kovaları arada temizle.
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

/** `key` için limit aşıldıysa false döner (istek reddedilmeli). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  sweep();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
