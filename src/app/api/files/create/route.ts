import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder, assertQuota } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { writeFile } from "@/lib/storage";
import { generateBlankFile, BLANK_KIND_INFO, type BlankKind } from "@/lib/blank-templates";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  kind: z.enum(["docx", "xlsx", "pptx"]),
  folderId: z.string().nullable().optional(),
});

/** Klasörde aynı isim varsa "ad (2).ext", "ad (3).ext" ... şeklinde benzersizleştirir. */
async function uniqueName(folderId: string | null, baseName: string) {
  const dot = baseName.lastIndexOf(".");
  const stem = dot === -1 ? baseName : baseName.slice(0, dot);
  const ext = dot === -1 ? "" : baseName.slice(dot);

  let name = baseName;
  let n = 2;
  while (await prisma.file.findFirst({ where: { folderId, name, deletedAt: null } })) {
    name = `${stem} (${n})${ext}`;
    n++;
  }
  return name;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { kind, folderId } = schema.parse(await req.json());

    const fId = folderId ?? null;
    if (fId) {
      const ok = await canAccessFolder(user, fId, "EDIT");
      if (!ok) return NextResponse.json({ error: "Bu klasöre oluşturma izniniz yok" }, { status: 403 });
    }

    const buffer = await generateBlankFile(kind as BlankKind);
    const size = BigInt(buffer.byteLength);
    const info = BLANK_KIND_INFO[kind as BlankKind];

    await assertFilePolicy(info.defaultName, size);
    await assertQuota(user, size);

    const name = await uniqueName(fId, info.defaultName);
    const storageKey = await writeFile(buffer);

    const created = await prisma.file.create({
      data: { name, mimeType: info.mimeType, size, folderId: fId, ownerId: user.id },
    });
    const version = await prisma.fileVersion.create({
      data: { fileId: created.id, versionNo: 1, storageKey, size, uploadedById: user.id },
    });
    const finalFile = await prisma.file.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
    await prisma.user.update({ where: { id: user.id }, data: { usedBytes: { increment: size } } });
    await notifyIfQuotaWarning(user.id);
    await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: created.id, detail: `yeni: ${name}` });

    return NextResponse.json({ ...finalFile, size: finalFile.size.toString(), searchText: undefined });
  } catch (err) {
    return errorResponse(err);
  }
}
