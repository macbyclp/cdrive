import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * "Beni ilgilendiren onaylar" — hem bana gelen (karar vermem gereken) hem benim
 * gönderdiğim istekler. Sürücüdeki Onaylar sekmesi ve bekleyen-onay rozeti bunu
 * kullanır.
 *
 * Silinmiş (çöp kutusundaki) dosyaların istekleri listelenmez: karar verilecek bir
 * belge ortada yoksa satır sadece kafa karıştırır.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const [incoming, outgoing] = await Promise.all([
      prisma.fileApproval.findMany({
        where: { approverId: user.id, file: { deletedAt: null } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          file: { select: { id: true, name: true, mimeType: true } },
          requestedBy: { select: { id: true, name: true, avatarKey: true, avatarParts: true } },
        },
      }),
      prisma.fileApproval.findMany({
        where: { requestedById: user.id, file: { deletedAt: null } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          file: { select: { id: true, name: true, mimeType: true } },
          approver: { select: { id: true, name: true, avatarKey: true, avatarParts: true } },
        },
      }),
    ]);

    return NextResponse.json({
      incoming,
      outgoing,
      pendingIncomingCount: incoming.filter((a) => a.status === "PENDING").length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
