import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { collectVisibleFiles } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

// "Medya" görünümü: erişilebilen tüm video/ses dosyalarını tek bir galeride listeler.
export async function GET() {
  try {
    const user = await requireUser();

    const visible = await collectVisibleFiles(
      user,
      (skip, take) =>
        prisma.file.findMany({
          where: {
            deletedAt: null,
            OR: [{ mimeType: { startsWith: "video/" } }, { mimeType: { startsWith: "audio/" } }],
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take,
        }),
      100
    );

    return NextResponse.json({
      files: visible.map((f) => ({ ...f, size: f.size.toString(), searchText: undefined })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
