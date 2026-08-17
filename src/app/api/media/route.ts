import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { filePermissionLevel } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

// "Medya" görünümü: erişilebilen tüm video/ses dosyalarını tek bir galeride listeler.
export async function GET() {
  try {
    const user = await requireUser();

    const candidates = await prisma.file.findMany({
      where: {
        deletedAt: null,
        OR: [{ mimeType: { startsWith: "video/" } }, { mimeType: { startsWith: "audio/" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });

    const visible: typeof candidates = [];
    for (const f of candidates) {
      if (user.role === "ADMIN" || f.ownerId === user.id) {
        visible.push(f);
      } else {
        const level = await filePermissionLevel(user, f.id);
        if (level) visible.push(f);
      }
      if (visible.length >= 100) break;
    }

    return NextResponse.json({
      files: visible.map((f) => ({ ...f, size: f.size.toString(), searchText: undefined })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
