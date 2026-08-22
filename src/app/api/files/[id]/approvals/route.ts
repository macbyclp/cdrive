import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { isValidApproverChoice } from "@/lib/approvals";
import { notifyUser } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const approvalInclude = {
  requestedBy: { select: { id: true, name: true, email: true, avatarKey: true, avatarParts: true } },
  approver: { select: { id: true, name: true, email: true, avatarKey: true, avatarParts: true } },
} as const;

/** Bir dosyanın onay geçmişi — dosyayı görebilen herkes okuyabilir. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!(await canAccessFile(user, id, "VIEW"))) {
      return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });
    }

    const approvals = await prisma.fileApproval.findMany({
      where: { fileId: id },
      orderBy: { createdAt: "desc" },
      include: approvalInclude,
    });
    return NextResponse.json(approvals);
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  approverId: z.string().min(1),
  note: z.string().trim().max(2000).optional(),
});

/**
 * Dosyayı onaya gönderir.
 *
 * Yetki: dosyayı DÜZENLEYEBİLEN (EDIT) kişi onaya gönderebilir — sadece görüntüleme
 * hakkı olan biri, başkasının belgesini onay sürecine sokamamalı. Onaylayıcının
 * dosyaya önceden erişimi olması GEREKMEZ; istek, ona görme hakkı verir
 * (bkz. lib/access.ts).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    if (!(await canAccessFile(user, id, "EDIT"))) {
      return NextResponse.json({ error: "Bu dosyayı onaya gönderme yetkiniz yok" }, { status: 403 });
    }

    const body = createSchema.parse(await req.json());

    if (!isValidApproverChoice(user.id, body.approverId)) {
      return NextResponse.json({ error: "Kendinizi onaylayıcı seçemezsiniz" }, { status: 400 });
    }

    const approver = await prisma.user.findFirst({
      where: { id: body.approverId, active: true },
      select: { id: true, name: true },
    });
    if (!approver) {
      return NextResponse.json({ error: "Onaylayıcı bulunamadı veya pasif" }, { status: 404 });
    }

    const file = await prisma.file.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!file) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });

    // Aynı anda tek bekleyen istek — MySQL'de kısmi benzersiz indeks olmadığı için
    // kuralı burada uyguluyoruz. Yarış durumunda iki istek açılabilir; zararsız
    // (ikisi de ayrı ayrı karara bağlanır) ama kullanıcıya karışık görünmesin diye
    // normal akışta engelleniyor.
    const existing = await prisma.fileApproval.findFirst({
      where: { fileId: id, status: "PENDING" },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Bu dosyada zaten bekleyen bir onay isteği var" },
        { status: 409 }
      );
    }

    const approval = await prisma.fileApproval.create({
      data: {
        fileId: id,
        requestedById: user.id,
        approverId: approver.id,
        note: body.note || null,
      },
      include: approvalInclude,
    });

    await notifyUser({
      userId: approver.id,
      type: "APPROVAL_REQUESTED",
      message: `${user.name}, "${file.name}" belgesini onayınıza gönderdi`,
      targetType: "approval",
      targetId: file.id,
    });
    await logAudit({
      userId: user.id,
      action: "APPROVAL_REQUEST",
      targetType: "file",
      targetId: file.id,
      detail: `onaya gönderildi → ${approver.name}`,
    });

    return NextResponse.json(approval);
  } catch (err) {
    return errorResponse(err);
  }
}
