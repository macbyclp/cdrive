import { NextResponse } from "next/server";
import { requireUser, AuthError, clearSessionCookie, getImpersonator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // requireSession (requireUser içinde) DB'deki oturum kaydının "revoke"
    // edilmediğini de kontrol eder — sadece JWT imzasının geçerli olması
    // yetmez, ör. hesap ayarlarından uzaktan kapatılmış bir oturum burada
    // reddedilmeli.
    const sessionUser = await requireUser();
    const [user, settings, impersonator] = await Promise.all([
      prisma.user.findUnique({ where: { id: sessionUser.id }, include: { department: true } }),
      // uiSkin sistem geneli bir görünüm ayarıdır (admin panelinden), her oturum
      // açmış kullanıcının (admin olmasa da) bilmesi gerekir — /api/me zaten her
      // sayfa yüklemesinde çağrıldığı için en ucuz taşıma noktası burası.
      prisma.systemSettings.findUnique({ where: { id: 1 }, select: { uiSkin: true } }),
      // Admin bu kullanıcıyı taklit ediyorsa TopBar'daki "geri dön" şeridini göstermek için.
      getImpersonator(),
    ]);
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
        uiSkin: (settings?.uiSkin as "modern" | "archive" | "panel") ?? "modern",
        canCreateOrders: user.canCreateOrders,
        canManageOrders: user.canManageOrders,
        canManageProduction: user.canManageProduction,
        avatarKey: user.avatarKey,
        avatarParts: user.avatarParts,
        hasSeenFeatureTour: user.hasSeenFeatureTour,
        impersonatedBy: impersonator?.adminName ?? null,
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
