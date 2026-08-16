import { NextResponse } from "next/server";
import { requireUser, AuthError, clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // requireSession (requireUser içinde) DB'deki oturum kaydının "revoke"
    // edilmediğini de kontrol eder — sadece JWT imzasının geçerli olması
    // yetmez, ör. hesap ayarlarından uzaktan kapatılmış bir oturum burada
    // reddedilmeli.
    const sessionUser = await requireUser();
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { department: true },
    });
    if (!user || !user.active) {
      await clearSessionCookie();
      return NextResponse.json({ user: null });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department?.name ?? null,
        usedBytes: user.usedBytes.toString(),
        quotaBytes: user.quotaBytes.toString(),
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      await clearSessionCookie();
      return NextResponse.json({ user: null });
    }
    throw err;
  }
}
