import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const ownerFilter = user.role === "ADMIN" ? {} : { ownerId: user.id };

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { deletedAt: { not: null }, ...ownerFilter },
        orderBy: { updatedAt: "desc" },
        include: { owner: { select: { name: true } } },
      }),
      prisma.file.findMany({
        where: { deletedAt: { not: null }, ...ownerFilter },
        orderBy: { updatedAt: "desc" },
        include: { owner: { select: { name: true } } },
      }),
    ]);

    return NextResponse.json({
      folders,
      files: files.map((f) => ({ ...f, size: f.size.toString() })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
