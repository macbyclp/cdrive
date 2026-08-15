import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

// Yıldız ikonlarını her listede ucuzca doldurabilmek için sadece id'leri döner.
export async function GET() {
  try {
    const user = await requireUser();
    const [fileStars, folderStars] = await Promise.all([
      prisma.fileStar.findMany({ where: { userId: user.id }, select: { fileId: true } }),
      prisma.folderStar.findMany({ where: { userId: user.id }, select: { folderId: true } }),
    ]);
    return NextResponse.json({
      fileIds: fileStars.map((s) => s.fileId),
      folderIds: folderStars.map((s) => s.folderId),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
