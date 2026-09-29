import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { visibleFileIds } from "@/lib/access";

// "Son kullanılanlar": kullanıcının kendi yükleme/indirme geçmişinden türetilir,
// ayrı bir tablo tutmaya gerek kalmadan audit_logs üzerinden hesaplanır.
export async function GET() {
  try {
    const user = await requireUser();
    const logs = await prisma.auditLog.findMany({
      where: {
        userId: user.id,
        targetType: "file",
        action: { in: ["UPLOAD", "DOWNLOAD"] },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
      select: { targetId: true },
    });

    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const log of logs) {
      if (log.targetId && !seen.has(log.targetId)) {
        seen.add(log.targetId);
        orderedIds.push(log.targetId);
      }
      if (orderedIds.length >= 20) break;
    }

    const files = await prisma.file.findMany({
      where: { id: { in: orderedIds }, deletedAt: null },
    });
    const byId = new Map(files.map((f) => [f.id, f]));
    // Erişimi sonradan kaldırılan dosyalar eski indirme/yükleme geçmişinden görünmeye devam etmesin.
    const visible = await visibleFileIds(user, files);
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((f): f is (typeof files)[number] => !!f && visible.has(f.id));

    return NextResponse.json({
      files: ordered.map((f) => ({ ...f, size: f.size.toString(), searchText: undefined })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
