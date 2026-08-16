import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { generateTotpSecret, totpQrCodeDataUrl } from "@/lib/totp";
import { errorResponse } from "@/lib/api-helpers";

// Yeni bir gizli anahtar üretir ve kullanıcıya (henüz devre dışı olarak) kaydeder;
// /api/account/2fa/enable ile bir kod doğrulanana kadar etkin olmaz.
export async function POST() {
  try {
    const user = await requireUser();
    if (user.twoFactorEnabled) {
      return NextResponse.json({ error: "İki adımlı doğrulama zaten açık" }, { status: 400 });
    }

    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
    const qrCode = await totpQrCodeDataUrl(user.email, secret);

    return NextResponse.json({ secret, qrCode });
  } catch (err) {
    return errorResponse(err);
  }
}
