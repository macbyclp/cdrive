import { z } from "zod";
import { OrderStatus } from "@prisma/client";

/**
 * Bayt cinsinden kota/boyut alanı. Değer sunucuda `BigInt(...)`'e çevrildiği için
 * tamsayı olmak ZORUNDA (BigInt(1.5) RangeError fırlatır → 500) ve negatif/sıfır
 * kota anlamsız. Arayüz zaten Math.round ile yuvarlıyor; bu, doğrudan API
 * çağrılarına karşı sunucu tarafı güvencesi.
 */
export const byteSize = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/**
 * `?status=` sorgu parametresini doğrular. "ALL"/boş → filtre yok (null);
 * bilinmeyen değer → undefined (çağıran 400 dönmeli; aksi halde Prisma enum
 * doğrulamasında 500'e düşer).
 */
export function parseOrderStatusFilter(raw: string | null): OrderStatus | null | undefined {
  if (!raw || raw === "ALL") return null;
  return Object.hasOwn(OrderStatus, raw) ? (raw as OrderStatus) : undefined;
}
