import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { departmentStorageUsage } from "@/lib/reports";

/**
 * Departman bazlı depolama kullanımı (ADMIN) — rapor ekranının kota tablosu.
 *
 * TÜM kullanıcılar çekilir (active filtresi yok): pasif hesaplar diskte yer
 * kaplamaya devam eder, rapordan düşürülmez. bigint alanlar (usedBytes/quotaBytes)
 * departmentStorageUsage içinde Number'a çevrilir — JSON.stringify bigint
 * threw ederdi.
 */
export async function GET() {
  try {
    await requireRole("ADMIN");

    const [departments, users] = await Promise.all([
      prisma.department.findMany(),
      prisma.user.findMany({ select: { departmentId: true, usedBytes: true } }),
    ]);

    return NextResponse.json(departmentStorageUsage(departments, users));
  } catch (err) {
    return errorResponse(err);
  }
}
