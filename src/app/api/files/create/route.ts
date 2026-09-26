import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canAccessFolder, assertQuota } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromBuffer } from "@/lib/file-versions";
import { uniqueFileName } from "@/lib/file-names";
import { generateBlankFile, BLANK_KIND_INFO, type BlankKind } from "@/lib/blank-templates";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

const schema = z.object({
  kind: z.enum(["docx", "xlsx", "pptx", "txt"]),
  folderId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("upload", user.id, 300, 60000);
    if (limited) return limited;
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

    const name = await uniqueFileName(fId, info.defaultName);
    const finalFile = await createFileFromBuffer({
      name,
      mimeType: info.mimeType,
      folderId: fId,
      ownerId: user.id,
      buffer,
    });
    await notifyIfQuotaWarning(user.id);
    await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: finalFile.id, detail: `yeni: ${name}` });

    return NextResponse.json({ ...finalFile, size: finalFile.size.toString(), searchText: undefined });
  } catch (err) {
    return errorResponse(err);
  }
}
