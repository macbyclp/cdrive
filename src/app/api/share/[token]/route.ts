import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serveStoredFile } from "@/lib/http-range";
import { verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { shareLinkStatus } from "@/lib/share";
import { errorResponse, clientIp } from "@/lib/api-helpers";

// Herkese açık indirme uç noktası — oturum gerektirmez, sadece geçerli token
// (ve varsa şifre). Şifre URL'de TAŞINMAZ (loglara/Referer'a sızar): tercih edilen yol POST gövdesi
// ({ password }); GET için `x-share-password` başlığı. `?password=` yalnızca geri-uyum için ve ancak
// SHARE_ALLOW_QUERY_PASSWORD=1 ise kabul edilir (varsayılan kapalı).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const queryAllowed = process.env.SHARE_ALLOW_QUERY_PASSWORD === "1";
  const password =
    req.headers.get("x-share-password") ?? (queryAllowed ? new URL(req.url).searchParams.get("password") : null) ?? "";
  return serve(req, token, password);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  return serve(req, token, typeof body.password === "string" ? body.password : "");
}

async function serve(req: Request, token: string, password: string) {
  try {
    if (!rateLimit(`share:${clientIp(req) ?? "unknown"}`, 60, 60_000)) {
      return NextResponse.json({ error: "Çok fazla istek. Lütfen biraz bekleyin." }, { status: 429 });
    }
    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: { file: { include: { currentVersion: true } } },
    });

    const rangeHeader = req.headers.get("range");
    const isContinuation = !!rangeHeader && !/^bytes=0-/.test(rangeHeader);
    let gate = shareLinkStatus(link);
    // İndirme limiti dolduktan sonra, İLK isteğin devamı olan Range istekleri (ör. medya arama) reddedilmez.
    if (!gate.ok && gate.reason === "limit" && isContinuation) gate = { ok: true };
    if (!link || !gate.ok) {
      // !link durumu shareLinkStatus içinde zaten 404'e çevriliyor; buradaki kontrol
      // TypeScript'in aşağıdaki link erişimlerini daraltabilmesi için.
      return NextResponse.json(
        { error: gate.ok ? "Bağlantı geçersiz veya iptal edilmiş" : gate.error },
        { status: gate.ok ? 404 : gate.status }
      );
    }
    if (link.passwordHash) {
      if (!password || !(await verifyPassword(password, link.passwordHash))) {
        return NextResponse.json({ error: "Şifre gerekli veya hatalı", requiresPassword: true }, { status: 401 });
      }
    }
    if (!link.file || link.file.deletedAt || !link.file.currentVersion) {
      return NextResponse.json({ error: "Dosya artık mevcut değil" }, { status: 404 });
    }

    // Range devam istekleri (kesilen indirmeyi sürdürme / medya arama) indirme sayacını ve denetim
    // kaydını tekrar artırmaz; yalnız ilk istek (Range yok ya da bytes=0-) sayılır.
    if (!isContinuation) {
      await prisma.shareLink.update({ where: { id: link.id }, data: { downloadCount: { increment: 1 } } });
      await logAudit({ ip: clientIp(req), action: "DOWNLOAD", targetType: "file", targetId: link.file.id, detail: `paylaşım linki: ${token}` });
    }

    return serveStoredFile(req, {
      storageKey: link.file.currentVersion.storageKey,
      contentType: link.file.mimeType || "application/octet-stream",
      headers: { "Content-Disposition": `attachment; filename="${encodeURIComponent(link.file.name)}"` },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
