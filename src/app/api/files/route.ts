import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder, assertQuota } from "@/lib/access";
import { writeFile } from "@/lib/storage";
import { extractSearchText } from "@/lib/text-extract";
import { assertFilePolicy } from "@/lib/policy";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const folderIdRaw = form.get("folderId");
    const folderId = typeof folderIdRaw === "string" && folderIdRaw.length > 0 ? folderIdRaw : null;
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
    }

    if (folderId) {
      const ok = await canAccessFolder(user, folderId, "EDIT");
      if (!ok) return NextResponse.json({ error: "Bu klasöre yükleme izniniz yok" }, { status: 403 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const size = BigInt(buffer.byteLength);

    await assertFilePolicy(file.name, size);
    await assertQuota(user, size);

    // Aynı klasörde aynı isimde dosya varsa -> yeni versiyon olarak ekle
    const existing = await prisma.file.findFirst({
      where: { folderId, name: file.name, deletedAt: null },
    });

    const storageKey = await writeFile(buffer);
    const searchText = await extractSearchText(buffer, file.type || "application/octet-stream");

    if (existing) {
      const lastVersion = await prisma.fileVersion.findFirst({
        where: { fileId: existing.id },
        orderBy: { versionNo: "desc" },
      });
      const versionNo = (lastVersion?.versionNo ?? 0) + 1;
      const version = await prisma.fileVersion.create({
        data: {
          fileId: existing.id,
          versionNo,
          storageKey,
          size,
          uploadedById: user.id,
        },
      });
      const sizeDelta = size - existing.size;
      const updated = await prisma.file.update({
        where: { id: existing.id },
        data: { size, mimeType: file.type || existing.mimeType, currentVersionId: version.id, searchText },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { usedBytes: { increment: sizeDelta > 0n ? sizeDelta : 0n } },
      });
      await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: existing.id, detail: `v${versionNo}: ${file.name}` });
      return NextResponse.json(serialize(updated));
    }

    const created = await prisma.file.create({
      data: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size,
        folderId,
        ownerId: user.id,
        searchText,
      },
    });
    const version = await prisma.fileVersion.create({
      data: { fileId: created.id, versionNo: 1, storageKey, size, uploadedById: user.id },
    });
    const finalFile = await prisma.file.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
    await prisma.user.update({ where: { id: user.id }, data: { usedBytes: { increment: size } } });
    await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: created.id, detail: file.name });
    return NextResponse.json(serialize(finalFile));
  } catch (err) {
    return errorResponse(err);
  }
}

function serialize(f: { size: bigint; searchText?: unknown; [k: string]: unknown }) {
  return { ...f, size: f.size.toString(), searchText: undefined };
}
