import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder, assertQuota } from "@/lib/access";
import { extractSearchText } from "@/lib/text-extract";
import { assertFilePolicy } from "@/lib/policy";
import { saveNewFileVersion, createFileFromBuffer } from "@/lib/file-versions";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("upload", user.id, 300, 60000);
    if (limited) return limited;
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

    // Aynı klasörde aynı isimde dosya varsa -> yeni versiyon olarak ekle
    // (kota, dosyanın SAHİBİNE karşı ve kilit altında saveNewFileVersion içinde kontrol edilir).
    const existing = await prisma.file.findFirst({
      where: { folderId, name: file.name, deletedAt: null },
    });

    if (existing) {
      const { file: updated } = await saveNewFileVersion(existing, buffer, user.id, {
        mimeType: file.type || existing.mimeType,
      });
      return NextResponse.json(serialize(updated));
    }

    await assertQuota(user, size); // diske yazmadan önce erken ret (asıl kontrol transaction içinde)
    const mimeType = file.type || "application/octet-stream";
    const searchText = await extractSearchText(buffer, mimeType);
    const finalFile = await createFileFromBuffer({
      name: file.name,
      mimeType,
      folderId,
      ownerId: user.id,
      buffer,
      searchText,
    });
    await notifyIfQuotaWarning(user.id);
    await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: finalFile.id, detail: file.name });
    return NextResponse.json(serialize(finalFile));
  } catch (err) {
    return errorResponse(err);
  }
}

function serialize(f: { size: bigint; searchText?: unknown; [k: string]: unknown }) {
  return { ...f, size: f.size.toString(), searchText: undefined };
}
