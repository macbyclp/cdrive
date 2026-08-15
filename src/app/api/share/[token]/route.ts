import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

// Herkese açık indirme uç noktası — oturum gerektirmez, sadece geçerli token
// (ve varsa şifre, ?password= sorgu parametresiyle).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: { file: { include: { currentVersion: true } } },
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
    if (link.passwordHash) {
      const password = new URL(req.url).searchParams.get("password") ?? "";
      if (!password || !(await verifyPassword(password, link.passwordHash))) {
        return NextResponse.json({ error: "Şifre gerekli veya hatalı", requiresPassword: true }, { status: 401 });
      }
    }
    if (!link.file || link.file.deletedAt || !link.file.currentVersion) {
      return NextResponse.json({ error: "Dosya artık mevcut değil" }, { status: 404 });
    }

    const buffer = await readFile(link.file.currentVersion.storageKey);
    await prisma.shareLink.update({ where: { id: link.id }, data: { downloadCount: { increment: 1 } } });
    await logAudit({ action: "DOWNLOAD", targetType: "file", targetId: link.file.id, detail: `paylaşım linki: ${token}` });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": link.file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(link.file.name)}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
