import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, clientIp, limitOr429 } from "@/lib/api-helpers";
import { uploadRequestStatus } from "@/lib/upload-request";
import { maxUploadBytes } from "@/lib/policy";
import { getOrgName } from "@/lib/org";

// Herkese açık (oturumsuz): yükleme sayfasının göstereceği asgari bilgi. Klasör adı, sahibi veya yolu AÇIKLANMAZ.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = limitOr429("upload-request-info", clientIp(req) ?? "unknown", 60, 60_000);
    if (limited) return limited;
    const { token } = await params;
    const r = await prisma.uploadRequest.findUnique({ where: { token } });
    const gate = uploadRequestStatus(r);
    if (!r || !gate.ok) {
      return NextResponse.json({ error: gate.ok ? "Bağlantı geçersiz veya iptal edilmiş" : gate.error }, { status: gate.ok ? 404 : gate.status });
    }
    const limit = Math.min(Number(r.maxFileBytes), await maxUploadBytes());
    return NextResponse.json({
      title: r.title,
      message: r.message,
      requiresPassword: !!r.passwordHash,
      expiresAt: r.expiresAt,
      remaining: r.maxFiles - r.uploadCount,
      maxFileBytes: limit,
      orgName: await getOrgName(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
