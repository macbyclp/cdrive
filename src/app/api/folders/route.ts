import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

async function breadcrumb(folderId: string | null) {
  const trail: { id: string; name: string }[] = [];
  let current = folderId ? await prisma.folder.findUnique({ where: { id: folderId } }) : null;
  while (current) {
    trail.unshift({ id: current.id, name: current.name });
    current = current.parentId
      ? await prisma.folder.findUnique({ where: { id: current.parentId } })
      : null;
  }
  return trail;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get("parentId");
    // Opsiyonel sayfalama (varsayılan: hepsi, eski davranış). `?limit=<1-500>&offset=<n>` her iki listeye de
    // uygulanır; yanıtta `page: { limit, offset, hasMoreFolders, hasMoreFiles }` döner.
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 100, 1), 500) : undefined;
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);
    const pg: { take?: number; skip?: number } = limit ? { take: limit + 1, skip: offset } : {};
    const paged = <T,>(rows: T[]) => (limit ? rows.slice(0, limit) : rows);
    const pageInfo = (f: unknown[], fl: unknown[]) =>
      limit ? { page: { limit, offset, hasMoreFolders: f.length > limit, hasMoreFiles: fl.length > limit } } : {};

    if (parentId) {
      const ok = await canAccessFolder(user, parentId, "VIEW");
      if (!ok) return NextResponse.json({ error: "Bu klasöre erişiminiz yok" }, { status: 403 });

      const [folders, files] = await Promise.all([
        prisma.folder.findMany({
          where: { parentId, deletedAt: null },
          orderBy: { name: "asc" },
          include: { tags: { include: { tag: true } } },
          ...pg,
        }),
        prisma.file.findMany({
          where: { folderId: parentId, deletedAt: null },
          orderBy: { name: "asc" },
          include: { tags: { include: { tag: true } } },
          ...pg,
        }),
      ]);
      return NextResponse.json({
        folders: paged(folders).map(serializeFolder),
        files: paged(files).map(serializeFile),
        breadcrumb: await breadcrumb(parentId),
        ...pageInfo(folders, files),
      });
    }

    // kök seviye
    const where =
      user.role === "ADMIN"
        ? { parentId: null, deletedAt: null }
        : {
            parentId: null,
            deletedAt: null,
            OR: [
              { ownerId: user.id },
              ...(user.role === "MANAGER" && user.departmentId
                ? [{ departmentId: user.departmentId }]
                : []),
              { permissions: { some: { userId: user.id } } },
            ],
          };

    const folders = await prisma.folder.findMany({
      where,
      orderBy: { name: "asc" },
      include: { tags: { include: { tag: true } } },
      ...pg,
    });
    const files = await prisma.file.findMany({
      where: {
        folderId: null,
        deletedAt: null,
        ownerId: user.id,
      },
      orderBy: { name: "asc" },
      include: { tags: { include: { tag: true } } },
      ...pg,
    });
    return NextResponse.json({
      folders: paged(folders).map(serializeFolder),
      files: paged(files).map(serializeFile),
      breadcrumb: [],
      ...pageInfo(folders, files),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({ name: z.string().min(1).max(255), parentId: z.string().nullable().optional() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json());
    const parentId = body.parentId ?? null;

    if (parentId) {
      const ok = await canAccessFolder(user, parentId, "EDIT");
      if (!ok) return NextResponse.json({ error: "Bu klasörde oluşturma izniniz yok" }, { status: 403 });
    }

    const parent = parentId ? await prisma.folder.findUnique({ where: { id: parentId } }) : null;

    const folder = await prisma.folder.create({
      data: {
        name: body.name,
        parentId,
        ownerId: user.id,
        departmentId: parent?.departmentId ?? (user.role === "MANAGER" ? user.departmentId : null),
      },
    });
    await logAudit({ userId: user.id, action: "CREATE_FOLDER", targetType: "folder", targetId: folder.id, detail: folder.name });
    return NextResponse.json(folder);
  } catch (err) {
    return errorResponse(err);
  }
}

type TagJoinRow = { tag: { id: string; name: string; color: string } };

function flattenTags(tags?: TagJoinRow[]) {
  return (tags ?? []).map((t) => t.tag);
}

function serializeFile(f: { size: bigint; tags?: TagJoinRow[]; [k: string]: unknown }) {
  return { ...f, size: f.size.toString(), searchText: undefined, tags: flattenTags(f.tags) };
}

function serializeFolder(f: { tags?: TagJoinRow[]; [k: string]: unknown }) {
  return { ...f, tags: flattenTags(f.tags) };
}
