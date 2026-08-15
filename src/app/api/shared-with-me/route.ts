import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const [filePerms, folderPerms] = await Promise.all([
      prisma.filePermission.findMany({
        where: { userId: user.id, file: { deletedAt: null } },
        include: { file: true },
      }),
      prisma.folderPermission.findMany({
        where: { userId: user.id, folder: { deletedAt: null } },
        include: { folder: true },
      }),
    ]);
    return NextResponse.json({
      files: filePerms.map((p) => ({ ...p.file, size: p.file.size.toString(), myPermission: p.permission })),
      folders: folderPerms.map((p) => ({ ...p.folder, myPermission: p.permission })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
