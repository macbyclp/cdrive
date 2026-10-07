// Yerel geliştirme için DEMO verisi: bir ADMIN ve bir MEMBER kullanıcı + birkaç örnek dosya/klasör.
//
//   node scripts/seed-demo.mjs
//
// Şifreler her çalıştırmada rastgele üretilir ve repoya GİRMEYEN `.demo-credentials.txt` dosyasına yazılır
// (konsola basılmaz). Yalnızca yerel (localhost) veritabanına karşı çalışır; canlıya karşı çalışmayı reddeder.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
  console.error("Güvenlik: yalnızca localhost veritabanına karşı çalışır (DATABASE_URL'i kontrol edin).");
  process.exit(1);
}

const prisma = new PrismaClient();
const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
fs.mkdirSync(storageRoot, { recursive: true });

const rnd = () => crypto.randomBytes(9).toString("base64url");
const users = [
  { email: "demo-admin@localhost.test", name: "Demo Yönetici", role: "ADMIN", password: rnd() },
  { email: "demo-uye@localhost.test", name: "Demo Üye", role: "MEMBER", password: rnd() },
];

async function addFile(owner, name, mimeType, text, folderId = null) {
  const exists = await prisma.file.findFirst({ where: { ownerId: owner.id, name, folderId, deletedAt: null } });
  if (exists) return exists;
  const key = crypto.randomUUID();
  const buf = Buffer.from(text, "utf-8");
  fs.writeFileSync(path.join(storageRoot, key), buf);
  const file = await prisma.file.create({
    data: { name, mimeType, size: BigInt(buf.length), ownerId: owner.id, folderId, searchText: text },
  });
  const v = await prisma.fileVersion.create({
    data: { fileId: file.id, versionNo: 1, storageKey: key, size: BigInt(buf.length), uploadedById: owner.id },
  });
  await prisma.user.update({ where: { id: owner.id }, data: { usedBytes: { increment: BigInt(buf.length) } } });
  return prisma.file.update({ where: { id: file.id }, data: { currentVersionId: v.id } });
}

const created = [];
for (const u of users) {
  const row = await prisma.user.upsert({
    where: { email: u.email },
    update: { passwordHash: await bcrypt.hash(u.password, 10), active: true, mustChangePassword: false },
    create: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
  });
  created.push({ ...u, id: row.id });
}
const [admin, member] = created;

const klasor =
  (await prisma.folder.findFirst({ where: { ownerId: admin.id, name: "Projeler", parentId: null } })) ??
  (await prisma.folder.create({ data: { name: "Projeler", ownerId: admin.id } }));

await addFile(
  admin,
  "Toplantı notları.txt",
  "text/plain",
  "Toplanti notlari\n\nBugun musteri ile gorusme yapildi. Fiyat teklifi gonderilecek.\nSonraki toplanti salida saat 14de.\nYapilacaklar: sozlesme taslagi hazirla, butce kontrol et.\n"
);
await addFile(
  admin,
  "Sözleşme taslağı.md",
  "text/markdown",
  "# Hizmet Sözleşmesi\n\nTaraflar: ABC Ltd. ve XYZ A.Ş.\nBedel: 15.000 TL (KDV hariç). Süre: 12 ay.\nFesih: 30 gün önceden yazılı bildirim.\n",
  klasor.id
);
await addFile(admin, "Fiyat listesi.csv", "text/csv", "urun,adet,fiyat\nDonuk burger,100,45\nDonuk tavuk,80,38\nPatates,200,22\n", klasor.id);
await addFile(member, "Üyenin notu.txt", "text/plain", "Bu dosya yalnızca Demo Üye'ye aittir; yönetici dışında kimse göremez.\n");

const out = path.resolve(process.cwd(), ".demo-credentials.txt");
fs.writeFileSync(
  out,
  ["Cdrive yerel demo hesapları (yalnızca localhost)", "", ...created.map((u) => `${u.role.padEnd(6)} ${u.email}   şifre: ${u.password}`), ""].join("\n"),
  { mode: 0o600 }
);
console.log(`Demo hesapları hazır. Giriş bilgileri: ${out}`);
await prisma.$disconnect();
