#!/usr/bin/env node
/**
 * Depolama mutabakatı: STORAGE_ROOT ile FileVersion kayıtlarını karşılaştırır.
 *
 * VARSAYILAN: yalnız RAPOR. Hiçbir şey silinmez, veritabanına HİÇ yazılmaz.
 *   node --env-file=.env scripts/yetim-dosya-raporu.mjs
 *
 * Bulduğu iki sınıf:
 *   1) YETİM DİSK DOSYASI: diskte var, hiçbir FileVersion.storageKey ona işaret etmiyor (yarım kalmış yükleme vb.).
 *   2) EKSİK İÇERİK: veritabanında sürüm kaydı var ama diskte dosyası yok (VERİ KAYBI şüphesi — yalnız raporlanır,
 *      asla otomatik "düzeltilmez").
 *
 * Silme (yalnız sınıf 1) AÇIK BAYRAK ister: --sil-yetim-disk-dosyalari
 * Ek güvenlik: son N saat içinde değişen dosyalar (devam eden yüklemeler) silinmez; varsayılan N=24, --min-yas-saat=N ile değişir.
 * Silmeden önce yedek aldığınızdan emin olun.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

const args = process.argv.slice(2);
const doDelete = args.includes("--sil-yetim-disk-dosyalari");
const ageArg = (args.find((a) => a.startsWith("--min-yas-saat=")) ?? "").split("=")[1];
const minAgeH = ageArg !== undefined && ageArg !== "" && !isNaN(Number(ageArg)) ? Number(ageArg) : 24;
const root = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "./storage");
const prisma = new PrismaClient();
const fmt = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

try {
  console.log(`Depolama kökü: ${root}  [${doDelete ? "SİLME AÇIK" : "yalnız rapor"}]`);
  const onDisk = new Map();
  for (const ent of await fs.readdir(root, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const st = await fs.stat(path.join(root, ent.name));
    onDisk.set(ent.name, { size: st.size, mtimeMs: st.mtimeMs });
  }

  const referenced = new Set();
  const missing = [];
  let cursor;
  for (;;) {
    const page = await prisma.fileVersion.findMany({
      take: 5000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, storageKey: true, fileId: true, versionNo: true },
    });
    if (page.length === 0) break;
    for (const v of page) {
      referenced.add(v.storageKey);
      if (!onDisk.has(v.storageKey)) missing.push(v);
    }
    cursor = page[page.length - 1].id;
  }

  const orphans = [...onDisk].filter(([key]) => !referenced.has(key));
  const orphanBytes = orphans.reduce((s, [, v]) => s + v.size, 0);
  console.log(`Diskteki dosya: ${onDisk.size}, DB sürüm kaydı: ${referenced.size}`);
  console.log(`1) Yetim disk dosyası: ${orphans.length} (${fmt(orphanBytes)})`);
  for (const [key, v] of orphans.slice(0, 50)) {
    console.log(`   ${key}  ${fmt(v.size)}  ${new Date(v.mtimeMs).toISOString()}`);
  }
  if (orphans.length > 50) console.log(`   ... ve ${orphans.length - 50} tane daha`);
  console.log(`2) Eksik içerik (DB'de var, diskte yok): ${missing.length}`);
  for (const v of missing.slice(0, 50)) console.log(`   sürüm ${v.id} (dosya ${v.fileId}, v${v.versionNo}) -> ${v.storageKey}`);

  if (doDelete) {
    const cutoff = Date.now() - minAgeH * 3_600_000;
    let deleted = 0;
    let freed = 0;
    for (const [key, v] of orphans) {
      if (v.mtimeMs > cutoff) continue; // yakın zamanda yazılmış: devam eden yükleme olabilir
      // Silmeden hemen önce tekrar doğrula (yarış): bu anahtar artık bir sürüme bağlandı mı?
      if (await prisma.fileVersion.findFirst({ where: { storageKey: key }, select: { id: true } })) continue;
      await fs.rm(path.join(root, key), { force: true });
      deleted++;
      freed += v.size;
    }
    console.log(`Silinen yetim dosya: ${deleted} (${fmt(freed)}); ${orphans.length - deleted} tanesi atlandı (yeni/devam eden).`);
  } else if (orphans.length) {
    console.log("Hiçbir şey silinmedi. Temizlemek için --sil-yetim-disk-dosyalari verin (önce yedek alın).");
  }
} finally {
  await prisma.$disconnect();
}
