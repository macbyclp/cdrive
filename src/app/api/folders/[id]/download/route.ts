import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { openReadStream, statFile } from "@/lib/storage";
import { Readable } from "stream";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";
import { contentDisposition, dedupeZipPath, safeZipSegment } from "@/lib/download-names";

type ZipEntry = { path: string; storageKey: string };

async function collectFolderTree(folderId: string, basePath: string, used: Set<string>): Promise<ZipEntry[]> {
  const [files, subfolders] = await Promise.all([
    prisma.file.findMany({ where: { folderId, deletedAt: null }, include: { currentVersion: true } }),
    prisma.folder.findMany({ where: { parentId: folderId, deletedAt: null } }),
  ]);

  const entries: ZipEntry[] = files
    .filter((f) => f.currentVersion)
    .map((f) => ({ path: dedupeZipPath(`${basePath}${safeZipSegment(f.name)}`, used), storageKey: f.currentVersion!.storageKey }));

  for (const sf of subfolders) {
    entries.push(...(await collectFolderTree(sf.id, `${basePath}${safeZipSegment(sf.name)}/`, used)));
  }
  return entries;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const ok = await canAccessFolder(user, id, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu klasöre erişiminiz yok" }, { status: 403 });

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.deletedAt) return NextResponse.json({ error: "Klasör bulunamadı" }, { status: 404 });

    // Adlar güvenli parçalara indirgenir (zip slip) ve çakışan yollar ayrıştırılır — bkz. lib/download-names.ts.
    const entries = await collectFolderTree(id, "", new Set());

    // Akışlı ZIP: dosyalar diskten sırayla okunup arşive akıtılır, tüm arşiv belleğe alınmaz.
    // (Toplam boyut baştan bilinmediği için Content-Length yoktur, yanıt chunked gider.)
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (e: Error) => console.warn("zip uyarı:", e.message));
    archive.on("error", (e: Error) => console.error("zip hata:", e));
    // Dosyalar TEK TEK eklenir (aynı anda binlerce açık dosya tanıtıcısı olmasın); diskte olmayan içerik atlanır.
    void (async () => {
      for (const entry of entries) {
        try {
          await statFile(entry.storageKey);
        } catch {
          continue;
        }
        const processed = new Promise<void>((resolve) => archive.once("entry", () => resolve()));
        archive.append(openReadStream(entry.storageKey), { name: entry.path });
        await processed;
      }
      await archive.finalize();
    })().catch((e: Error) => archive.destroy(e));

    await logAudit({ userId: user.id, action: "DOWNLOAD", targetType: "folder", targetId: id, detail: `zip: ${folder.name}` });

    return new Response(Readable.toWeb(archive) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition("attachment", `${folder.name}.zip`),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
