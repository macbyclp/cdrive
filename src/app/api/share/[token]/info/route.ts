import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-helpers";

// Herkese açık, dosya içeriğini göstermeden bağlantının durumunu ve dosya
// meta verisini döner — /s/[token] iniş sayfası bunu kullanır.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: { file: true },
    });

    if (!link || link.revoked) {
      return NextResponse.json({ error: "Bağlantı geçersiz veya iptal edilmiş" }, { status: 404 });
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "Bağlantının süresi dolmuş" }, { status: 410 });
    }
    if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
      return NextResponse.json({ error: "İndirme limitine ulaşıldı" }, { status: 410 });
    }
    if (!link.file || link.file.deletedAt) {
      return NextResponse.json({ error: "Dosya artık mevcut değil" }, { status: 404 });
    }

    return NextResponse.json({
      name: link.file.name,
      mimeType: link.file.mimeType,
      size: link.file.size.toString(),
      requiresPassword: !!link.passwordHash,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
