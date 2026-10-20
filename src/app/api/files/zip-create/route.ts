import { NextResponse } from "next/server";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromKey } from "@/lib/file-versions";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { freeDiskBytes, moveIntoStorage, uploadsDir } from "@/lib/storage";
import { validFileName } from "@/lib/agent-upload";
import { PackError, buildArchive, collectSelection } from "@/lib/zip-pack";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const schema = z.object({
  fileIds: z.array(z.string()).optional(),
  folderIds: z.array(z.string()).optional(),
  /** ZIP'in kaydedileceği klasör (boşsa ana klasör). */
  folderId: z.string().nullable().optional(),
  name: z.string().max(200).optional(),
});

/** Seçili öğeleri sürücüde yeni bir .zip dosyası olarak saklar (kullanıcının kendi kotasına sayılır). */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("zip-create", user.id, 10, 60_000);
    if (limited) return limited;
    const body = schema.parse(await req.json());
    const folderId = body.folderId || null;
    if (folderId && !(await canAccessFolder(user, folderId, "EDIT"))) throw new PackError("Bu klasöre dosya ekleme izniniz yok", 403);

    const { entries, totalBytes, label } = await collectSelection(user, body);
    const free = await freeDiskBytes();
    if (free !== null && free < totalBytes + 512 * 1024 * 1024) throw new PackError("Sunucuda yeterli disk alanı yok", 507);

    // Ad: istenen ya da etiket + .zip; aynı klasörde çakışırsa " (2)", " (3)"…
    let base = (body.name ?? "").trim().replace(/\.zip$/i, "") || label;
    if (!validFileName(`${base}.zip`)) base = "Cdrive-arsiv";
    let name = `${base}.zip`;
    for (let n = 2; await prisma.file.findFirst({ where: { folderId, name, deletedAt: null, ...(folderId === null ? { ownerId: user.id } : {}) } }); n++) {
      name = `${base} (${n}).zip`;
    }
    await assertFilePolicy(name, BigInt(totalBytes)); // üst sınır tahmini: sıkıştırılmış boyut ≤ ham boyut

    const tmp = path.join(await uploadsDir(), `${randomUUID()}.zip`);
    try {
      const { stream } = buildArchive(entries, 1); // hız için düşük sıkıştırma (çoğu içerik zaten sıkışık: video/foto)
      await pipeline(stream, createWriteStream(tmp));
      const size = (await fs.stat(tmp)).size;
      await assertFilePolicy(name, BigInt(size));
      const storageKey = await moveIntoStorage(tmp);
      const file = await createFileFromKey({ name, mimeType: "application/zip", folderId, ownerId: user.id, storageKey, size: BigInt(size) });
      await notifyIfQuotaWarning(user.id);
      await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: file.id, detail: `${name} (ZIP, ${entries.length} dosya)` });
      return NextResponse.json({ id: file.id, name, size, files: entries.length }, { status: 201 });
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  } catch (err) {
    if (err instanceof PackError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
