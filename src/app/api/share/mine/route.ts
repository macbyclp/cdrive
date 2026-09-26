import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { shareLinkStatus } from "@/lib/share";

/**
 * Kullanıcının oluşturduğu, iptal edilmemiş genel paylaşım bağlantıları — dosya
 * dosya gezmeden "dışarıya açık ne bıraktım?" sorusunu tek yerden cevaplar.
 * Süresi dolmuş / limiti bitmiş bağlantılar da `status` ile birlikte döner; çöpteki
 * dosyaların bağlantıları zaten indirilemez, listede de gösterilmez.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const links = await prisma.shareLink.findMany({
      where: { createdById: user.id, revoked: false, file: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { file: { select: { id: true, name: true, mimeType: true } } },
    });
    const now = new Date();
    return NextResponse.json(
      links.map(({ passwordHash, ...l }) => {
        const status = shareLinkStatus(l, now);
        return { ...l, hasPassword: !!passwordHash, status: status.ok ? "active" : status.reason };
      })
    );
  } catch (err) {
    return errorResponse(err);
  }
}
