import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shareLinkStatus } from "@/lib/share";
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

    const gate = shareLinkStatus(link);
    if (!link || !gate.ok) {
      return NextResponse.json(
        { error: gate.ok ? "Bağlantı geçersiz veya iptal edilmiş" : gate.error },
        { status: gate.ok ? 404 : gate.status }
      );
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
