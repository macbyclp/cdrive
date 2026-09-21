import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Kota muhasebesi (tek kaynak).
 *
 * TANIM: bir kullanıcının kullanımı (`User.usedBytes`) = sahibi olduğu, çöp kutusunda
 * OLMAYAN dosyaların TÜM `FileVersion` boyutlarının toplamı. Yani eski sürümler de
 * kotaya sayılır; aynı dosyayı tekrar tekrar yükleyerek kotayı aşmak mümkün değildir.
 *
 * Kullanım delta tabanlıdır (artır/azalt) ve her zaman kullanıcı satırı kilitlenerek
 * (SELECT ... FOR UPDATE) bir transaction içinde uygulanır; böylece eşzamanlı yüklemeler
 * kotayı birlikte aşamaz. Mevcut kayıtlardaki sapmalar `scripts/kota-duzelt.mjs` ile düzeltilir.
 */
export type Db = Prisma.TransactionClient;

/** Kullanıcı satırını kilitler (transaction içinde çağrılmalı). */
export async function lockUser(tx: Db, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

/** usedBytes'ı delta kadar değiştirir (0'ın altına düşmez). Transaction içinde, kilit alındıktan sonra çağrılmalı. */
export async function adjustUsedBytes(tx: Db, userId: string, delta: bigint) {
  if (delta === 0n) return;
  const u = await tx.user.findUnique({ where: { id: userId }, select: { usedBytes: true } });
  if (!u) return;
  const next = u.usedBytes + delta;
  await tx.user.update({ where: { id: userId }, data: { usedBytes: next < 0n ? 0n : next } });
}

/** Verilen dosyaların tüm sürümlerinin boyut toplamını SAHİP başına gruplayarak döner. */
export async function versionBytesByOwner(
  db: Db | typeof prisma,
  files: { id: string; ownerId: string }[]
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  if (files.length === 0) return result;
  const ownerOf = new Map(files.map((f) => [f.id, f.ownerId]));
  const groups = await db.fileVersion.groupBy({
    by: ["fileId"],
    where: { fileId: { in: files.map((f) => f.id) } },
    _sum: { size: true },
  });
  for (const g of groups) {
    const owner = ownerOf.get(g.fileId);
    if (!owner) continue;
    result.set(owner, (result.get(owner) ?? 0n) + (g._sum.size ?? 0n));
  }
  return result;
}

export function quotaError(message: string) {
  const err = new Error(message);
  (err as Error & { status?: number }).status = 413;
  return err;
}
