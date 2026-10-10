import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { usageReport } from "@/lib/claude-usage";

// Yönetici raporu: son 30 gün, kullanıcı bazında token/istek/sohbet kullanımı + günlük kota sınırları.
export async function GET() {
  try {
    await requireRole("ADMIN");
    return NextResponse.json(await usageReport(30));
  } catch (err) {
    return errorResponse(err);
  }
}
