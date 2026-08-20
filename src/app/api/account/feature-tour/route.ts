import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Özellik turu modalı kapatıldığında bir kereliğine çağrılır — kullanıcı bir daha
 * otomatik görmesin diye hasSeenFeatureTour true'ya çekilir. Hesap Ayarları'ndaki
 * "tekrar göster" butonu bunu ÇAĞIRMAZ (sadece istemci tarafında yeniden açar),
 * o yüzden bu uç nokta idempotent ve tamamen kendi kendine hizmet eder (admin
 * onayı gerekmez, herkes sadece kendi bayrağını kapatabilir).
 */
export async function POST() {
  try {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { hasSeenFeatureTour: true } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
