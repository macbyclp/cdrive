import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile, canAccessFolder } from "@/lib/access";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { storagePathFor } from "@/lib/storage";
import { extractZipToFolder } from "@/lib/zip-extract";
import { validFileName } from "@/lib/agent-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const schema = z.object({ folderId: z.string().nullable().optional() });

/**
 * Sürücüdeki bir .zip dosyasının içeriğini, zip'in adıyla yeni bir klasöre çıkarır (akışlı; bellek kullanmaz).
 * Hedef klasör verilmezse zip'in bulunduğu klasör kullanılır.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const limited = limitOr429("zip-extract", user.id, 10, 60_000);
    if (limited) return limited;
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));

    if (!(await canAccessFile(user, id, "VIEW"))) return NextResponse.json({ error: "Bu dosyaya erişim izniniz yok" }, { status: 403 });
    const file = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!file || file.deletedAt || !file.currentVersion) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    if (!file.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "Yalnızca .zip dosyaları çıkarılabilir" }, { status: 400 });

    const destParent = body.folderId === undefined ? file.folderId : body.folderId;
    if (destParent && !(await canAccessFolder(user, destParent, "EDIT"))) {
      return NextResponse.json({ error: "Bu klasöre dosya çıkarma izniniz yok" }, { status: 403 });
    }

    // Sarmalayıcı klasör: zip adı (çakışırsa " (2)"…) — arşivin içeriği mevcut dosyaların arasına dağılmasın.
    let base = file.name.replace(/\.zip$/i, "").trim();
    if (!validFileName(base)) base = "Cdrive-arsiv";
    let folderName = base;
    for (let n = 2; await prisma.folder.findFirst({ where: { name: folderName, parentId: destParent, deletedAt: null, ...(destParent === null ? { ownerId: user.id } : {}) } }); n++) {
      folderName = `${base} (${n})`;
    }
    const parent = destParent ? await prisma.folder.findUnique({ where: { id: destParent } }) : null;
    const wrapper = await prisma.folder.create({
      data: { name: folderName, parentId: destParent, ownerId: user.id, departmentId: parent?.departmentId ?? (user.role === "MANAGER" ? user.departmentId : null) },
    });

    const result = await extractZipToFolder({
      user,
      zipPath: storagePathFor(file.currentVersion.storageKey),
      zipName: file.name,
      rootFolderId: wrapper.id,
    });
    return NextResponse.json({ folderId: wrapper.id, folderName, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
