import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { shareLinkStatus } from "@/lib/share";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ password: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { password } = schema.parse(await req.json());
    const link = await prisma.shareLink.findUnique({ where: { token } });
    // Önceden burada SADECE `revoked` kontrol ediliyordu — süresi dolmuş ya da indirme
    // limiti dolmuş bir bağlantının şifresi "doğru" onaylanıp kullanıcı indirme
    // ekranına geçiyor, indirme ise 410 ile patlıyordu. Artık indirme uç noktasıyla
    // aynı kapıyı kullanıyor (bkz. lib/share.ts).
    const gate = shareLinkStatus(link);
    if (!link || !gate.ok) {
      return NextResponse.json(
        { error: gate.ok ? "Bağlantı geçersiz" : gate.error },
        { status: gate.ok ? 404 : gate.status }
      );
    }
    if (!link.passwordHash) return NextResponse.json({ ok: true });
    if (!(await verifyPassword(password, link.passwordHash))) {
      return NextResponse.json({ error: "Şifre hatalı" }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
