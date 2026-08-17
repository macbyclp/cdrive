import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder, assertQuota } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { writeFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import {
  officeDocType,
  extOf,
  isOnlyOfficeConfigured,
  signOfficeContentToken,
  convertDocument,
} from "@/lib/onlyoffice";

const ALLOWED_TARGETS = ["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv"];
const schema = z.object({ toExt: z.enum(ALLOWED_TARGETS as [string, ...string[]]) });

/** Klasörde aynı isim varsa "ad (2).ext" ... şeklinde benzersizleştirir. */
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

/**
 * Bir Office belgesini başka bir formata (ör. docx → pdf) dönüştürür ve
 * sonucu ORİJİNALİ DEĞİŞTİRMEDEN aynı klasörde yeni, ayrı bir dosya olarak
 * kaydeder. OnlyOffice Document Server gerektirir (bkz. README).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    if (!isOnlyOfficeConfigured() || !process.env.APP_URL) {
      return NextResponse.json(
        { error: "OnlyOffice Document Server yapılandırılmamış (ONLYOFFICE_URL/APP_URL eksik). README'ye bakın." },
        { status: 503 }
      );
    }

    const canView = await canAccessFile(user, id, "VIEW");
    if (!canView) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const { toExt } = schema.parse(await req.json());

    const file = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!file || file.deletedAt || !file.currentVersion) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    const fromExt = extOf(file.name);
    if (!officeDocType(file.name)) {
      return NextResponse.json({ error: "Bu dosya türü dönüştürülemez" }, { status: 400 });
    }
    if (fromExt === toExt) {
      return NextResponse.json({ error: "Kaynak ve hedef format aynı" }, { status: 400 });
    }

    if (file.folderId) {
      const editOk = await canAccessFolder(user, file.folderId, "EDIT");
      if (!editOk) return NextResponse.json({ error: "Bu klasöre dosya ekleme izniniz yok" }, { status: 403 });
    }

    const contentToken = await signOfficeContentToken({
      fileId: file.id,
      versionId: file.currentVersion.id,
      userId: user.id,
    });
    const appUrl = process.env.APP_URL!.replace(/\/$/, "");
    const sourceUrl = `${appUrl}/api/files/${file.id}/office/content?token=${contentToken}`;

    let convertedUrl: string;
    try {
      convertedUrl = await convertDocument({
        sourceUrl,
        fromExt,
        toExt,
        key: `${file.id}-${file.currentVersion.id}-${toExt}-${Date.now()}`,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Dönüştürme başarısız oldu" },
        { status: 502 }
      );
    }

    const downloaded = await fetch(convertedUrl);
    if (!downloaded.ok) {
      return NextResponse.json({ error: "Dönüştürülen dosya indirilemedi" }, { status: 502 });
    }
    const buffer = Buffer.from(await downloaded.arrayBuffer());
    const size = BigInt(buffer.byteLength);

    const stem = file.name.slice(0, file.name.length - fromExt.length - 1);
    const targetName = await uniqueName(file.folderId, `${stem}.${toExt}`);

    await assertFilePolicy(targetName, size);
    await assertQuota(user, size);

    const storageKey = await writeFile(buffer);
    const created = await prisma.file.create({
      data: {
        name: targetName,
        mimeType: mimeForExt(toExt),
        size,
        folderId: file.folderId,
        ownerId: user.id,
      },
    });
    const version = await prisma.fileVersion.create({
      data: { fileId: created.id, versionNo: 1, storageKey, size, uploadedById: user.id },
    });
    const finalFile = await prisma.file.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
    await prisma.user.update({ where: { id: user.id }, data: { usedBytes: { increment: size } } });
    await logAudit({
      userId: user.id,
      action: "UPLOAD",
      targetType: "file",
      targetId: created.id,
      detail: `dönüştürüldü (${file.name} → ${toExt}): ${targetName}`,
    });

    return NextResponse.json({ ...finalFile, size: finalFile.size.toString(), searchText: undefined });
  } catch (err) {
    return errorResponse(err);
  }
}

function mimeForExt(ext: string) {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    rtf: "application/rtf",
    txt: "text/plain",
    csv: "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}
