import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canDecide, canCancel } from "@/lib/approvals";
import { notifyUser } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  decisionNote: z.string().trim().max(2000).optional(),
});

/**
 * Bir onay isteğini karara bağlar (onayla/reddet) veya geri çeker.
 *
 * Yetki kuralları lib/approvals.ts'te (saf fonksiyonlar, testli):
 * - onayla/reddet: SADECE atanan onaylayıcı — admin istisnası bilerek yok, çünkü
 *   onay bir kişinin iradesini kaydeder, admin başkasının yerine imza atmamalı.
 * - geri çek: isteği açan kişi veya ADMIN (bu bir karar değil, temizlik işlemi).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const body = patchSchema.parse(await req.json());

    const approval = await prisma.fileApproval.findUnique({
      where: { id },
      include: { file: { select: { id: true, name: true } } },
    });
    if (!approval) return NextResponse.json({ error: "Onay isteği bulunamadı" }, { status: 404 });

    const actor = { id: user.id, role: user.role };

    if (body.action === "cancel") {
      if (!canCancel(actor, approval)) {
        return NextResponse.json(
          { error: "Bu isteği geri çekemezsiniz (karara bağlanmış olabilir)" },
          { status: 403 }
        );
      }
      const updated = await prisma.fileApproval.update({
        where: { id },
        data: { status: "CANCELLED", decidedAt: new Date(), decisionNote: body.decisionNote || null },
      });
      await logAudit({
        userId: user.id,
        action: "APPROVAL_CANCEL",
        targetType: "file",
        targetId: approval.fileId,
        detail: `onay isteği geri çekildi: ${approval.file.name}`,
      });
      // Geri çekildiğini onaylayıcı da bilmeli — beklediği bir iş listesinden düşüyor.
      await notifyUser({
        userId: approval.approverId,
        type: "APPROVAL_DECIDED",
        message: `${user.name}, "${approval.file.name}" belgesi için onay isteğini geri çekti`,
        targetType: "approval",
        targetId: approval.fileId,
      });
      return NextResponse.json(updated);
    }

    if (!canDecide(actor, approval)) {
      return NextResponse.json(
        { error: "Bu isteği karara bağlama yetkiniz yok" },
        { status: 403 }
      );
    }

    const approved = body.action === "approve";
    const updated = await prisma.fileApproval.update({
      where: { id },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        decidedAt: new Date(),
        decisionNote: body.decisionNote || null,
      },
    });

    await logAudit({
      userId: user.id,
      action: approved ? "APPROVAL_APPROVE" : "APPROVAL_REJECT",
      targetType: "file",
      targetId: approval.fileId,
      detail: `${approved ? "onaylandı" : "reddedildi"}: ${approval.file.name}${
        body.decisionNote ? ` — ${body.decisionNote}` : ""
      }`,
    });

    await notifyUser({
      userId: approval.requestedById,
      type: "APPROVAL_DECIDED",
      message: `${user.name}, "${approval.file.name}" belgesini ${approved ? "onayladı" : "reddetti"}`,
      targetType: "approval",
      targetId: approval.fileId,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
