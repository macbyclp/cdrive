import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Bir etiketi kalıcı olarak siler. Etiketler kurum geneli bir taksonomi ve silme
 * cascade ile etiketi HER dosya/klasörden kaldırır — kullanıcının erişemediği
 * dosyalar dahil. Bu yüzden:
 * - ADMIN her etiketi silebilir;
 * - diğer kullanıcılar yalnız hiçbir dosya/klasöre uygulanmamış etiketi silebilir
 *   (ör. yanlış yazıp oluşturdukları). Koşul silme sorgusunun içinde, böylece
 *   kontrol ile silme arasında etiket uygulanırsa silinmez.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const where =
      user.role === "ADMIN" ? { id } : { id, fileTags: { none: {} }, folderTags: { none: {} } };
    const { count } = await prisma.tag.deleteMany({ where });
    if (count > 0) return NextResponse.json({ ok: true });

    const exists = await prisma.tag.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ ok: true }); // zaten silinmiş — eski davranışla uyumlu
    return NextResponse.json(
      { error: "Bu etiket kullanımda. Önce dosyalardan kaldırın ya da bir yöneticiden silmesini isteyin." },
      { status: 403 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
