#!/usr/bin/env node
/**
 * Kota (User.usedBytes) mutabakat/düzeltme scripti.
 *
 * TANIM (bkz. src/lib/quota.ts): kullanım = sahibi olduğu, çöp kutusunda OLMAYAN dosyaların TÜM sürüm
 * (FileVersion) boyutlarının toplamı. Eski kayıtlar bu tanımdan önce yazıldığı için sapmış olabilir.
 *
 * VARSAYILAN: DRY-RUN — yalnız rapor verir, hiçbir şey yazmaz.
 *   node --env-file=.env scripts/kota-duzelt.mjs            # rapor
 *   node --env-file=.env scripts/kota-duzelt.mjs --apply    # sapmaları GERÇEKTEN düzeltir (önce yedek alın!)
 *
 * Yalnız `users.usedBytes` güncellenir; dosya/sürüm/diske dokunmaz. Kota AŞAN kullanıcılar yalnızca
 * raporlanır (dosyaları silinmez; yeni yüklemeleri kota altına inene kadar reddedilir).
 * Bu script CANLI veritabanında çalıştırılmak üzere yazıldı ama otomatik ÇALIŞTIRILMAZ.
 */
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const fmt = (n) => {
  let v = Number(n);
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (Math.abs(v) >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
};

try {
  const rows = await prisma.$queryRaw`
    SELECT f.ownerId AS ownerId, SUM(v.size) AS total
    FROM file_versions v JOIN files f ON f.id = v.fileId
    WHERE f.deletedAt IS NULL
    GROUP BY f.ownerId`;
  const expected = new Map(rows.map((r) => [r.ownerId, BigInt(String(r.total).split(".")[0])]));

  const users = await prisma.user.findMany({
    select: { id: true, email: true, usedBytes: true, quotaBytes: true, departmentId: true },
  });

  const diffs = [];
  for (const u of users) {
    const want = expected.get(u.id) ?? 0n;
    if (want !== u.usedBytes) diffs.push({ ...u, want });
  }

  console.log(`Kullanıcı: ${users.length}, sapması olan: ${diffs.length}  [${apply ? "UYGULAMA" : "DRY-RUN"}]`);
  for (const d of diffs) {
    console.log(`  ${d.email}: kayıtlı ${fmt(d.usedBytes)} -> olması gereken ${fmt(d.want)} (fark ${fmt(d.want - d.usedBytes)})`);
  }

  const orphanFiles = await prisma.file.count({ where: { deletedAt: null, versions: { none: {} } } });
  if (orphanFiles) console.log(`UYARI: sürümü hiç olmayan (içeriksiz) aktif dosya: ${orphanFiles} — kotaya 0 sayılır, ayrıca inceleyin.`);

  const over = users.filter((u) => (expected.get(u.id) ?? 0n) > u.quotaBytes);
  for (const u of over) console.log(`KOTA AŞIMI (yalnız rapor): ${u.email}: ${fmt(expected.get(u.id))} / ${fmt(u.quotaBytes)}`);

  const depts = await prisma.department.findMany();
  for (const d of depts) {
    if (d.quotaBytes <= 0n) continue;
    const used = users.filter((u) => u.departmentId === d.id).reduce((s, u) => s + (expected.get(u.id) ?? 0n), 0n);
    if (used > d.quotaBytes) console.log(`DEPARTMAN KOTA AŞIMI (yalnız rapor): ${d.name}: ${fmt(used)} / ${fmt(d.quotaBytes)} — yeni yüklemeler reddedilir.`);
  }

  if (apply && diffs.length) {
    await prisma.$transaction(
      diffs.map((d) => prisma.user.update({ where: { id: d.id }, data: { usedBytes: d.want } }))
    );
    console.log(`${diffs.length} kullanıcının usedBytes değeri güncellendi.`);
  } else if (diffs.length) {
    console.log("Hiçbir şey yazılmadı (dry-run). Uygulamak için --apply verin.");
  }
} finally {
  await prisma.$disconnect();
}
