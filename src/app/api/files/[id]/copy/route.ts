import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromBuffer } from "@/lib/file-versions";
import { copyNameFor, uniqueFileName } from "@/lib/file-names";
import { readFile } from "@/lib/storage";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

// folderId verilmezse kaynak dosyanın klasörü denenir; orada yazma izni yoksa
// (ör. yalnız görüntüleme yetkisiyle paylaşılmış bir dosya) kopya kullanıcının
// kök dizinine düşer. Açıkça verilen klasörde yazma izni yoksa 403.
const schema = z.object({ folderId: z.string().nullable().optional() });

/**
 * Dosyanın GÜNCEL sürümünün bağımsız bir kopyasını oluşturur. Kopyanın sahibi
 * isteği yapan kullanıcıdır ve boyutu onun kotasına yazılır; sürüm geçmişi,
 * etiketler, yorumlar ve paylaşımlar kopyalanmaz.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const limited = limitOr429("upload", user.id, 300, 60000);
    if (limited) return limited;
    const body = schema.parse(await req.json().catch(() => ({})));

    if (!(await canAccessFile(user, id, "VIEW"))) {
      return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });
    }
    const source = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!source || source.deletedAt || !source.currentVersion) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    let folderId: string | null;
    if (body.folderId !== undefined) {
      folderId = body.folderId;
      if (folderId && !(await canAccessFolder(user, folderId, "EDIT"))) {
        return NextResponse.json({ error: "Bu klasöre dosya ekleme izniniz yok" }, { status: 403 });
      }
    } else {
      folderId = source.folderId;
      if (folderId && !(await canAccessFolder(user, folderId, "EDIT"))) folderId = null;
    }

    await assertFilePolicy(source.name, source.currentVersion.size);
    const buffer = await readFile(source.currentVersion.storageKey);
    const name = await uniqueFileName(folderId, copyNameFor(source.name));
    // Kota kontrolü createFileFromBuffer içinde, kullanıcı satırı kilitliyken yapılır.
    const copy = await createFileFromBuffer({
      name,
      mimeType: source.mimeType,
      folderId,
      ownerId: user.id,
      buffer,
      searchText: source.searchText,
    });
    await notifyIfQuotaWarning(user.id);
    await logAudit({
      userId: user.id,
      action: "UPLOAD",
      targetType: "file",
      targetId: copy.id,
      detail: `kopya: ${name} ← ${source.name}`,
    });

    return NextResponse.json({ ...copy, size: copy.size.toString(), searchText: undefined });
  } catch (err) {
    return errorResponse(err);
  }
}
