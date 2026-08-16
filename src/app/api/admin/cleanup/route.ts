import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { runCleanup } from "@/lib/cleanup";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

// İki tetikleme yolu:
// 1) Admin panelinden "Şimdi çalıştır" (normal oturum + ADMIN rolü).
// 2) Harici bir zamanlayıcı (ör. cPanel Cron Job) — `Authorization: Bearer
//    $CRON_SECRET` header'ı ile, oturum gerektirmeden. CRON_SECRET .env'de
//    tanımlı değilse bu yol tamamen kapalıdır (varsayılan güvenli).
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

    let adminId: string | null = null;
    if (!isCron) {
      const admin = await requireRole("ADMIN");
      adminId = admin.id;
    }

    const result = await runCleanup();
    await logAudit({
      userId: adminId,
      action: "AUTO_CLEANUP",
      detail: `${result.purgedFolders} klasör, ${result.purgedFiles} dosya, ${result.purgedVersions} versiyon kalıcı silindi`,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
