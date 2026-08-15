import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { readFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

type ZipEntry = { path: string; storageKey: string };

async function collectFolderTree(folderId: string, basePath: string): Promise<ZipEntry[]> {
  const [files, subfolders] = await Promise.all([
    prisma.file.findMany({ where: { folderId, deletedAt: null }, include: { currentVersion: true } }),
    prisma.folder.findMany({ where: { parentId: folderId, deletedAt: null } }),
  ]);

  const entries: ZipEntry[] = files
    .filter((f) => f.currentVersion)
    .map((f) => ({ path: `${basePath}${f.name}`, storageKey: f.currentVersion!.storageKey }));

  for (const sf of subfolders) {
    entries.push(...(await collectFolderTree(sf.id, `${basePath}${sf.name}/`)));
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

    const entries = await collectFolderTree(id, "");

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve, reject) => {
      archive.on("end", resolve);
      archive.on("error", reject);
    });

    for (const entry of entries) {
      const buf = await readFile(entry.storageKey);
      archive.append(buf, { name: entry.path });
    }
    await archive.finalize();
    await done;

    const zipBuffer = Buffer.concat(chunks);
    await logAudit({ userId: user.id, action: "DOWNLOAD", targetType: "folder", targetId: id, detail: `zip: ${folder.name}` });

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(folder.name)}.zip"`,
        "Content-Length": String(zipBuffer.byteLength),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
