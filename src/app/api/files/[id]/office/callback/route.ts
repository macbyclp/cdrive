import { NextResponse } from "next/server";
import mime from "mime-types";
import { prisma } from "@/lib/prisma";
import { assertQuota, canAccessFile } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { saveNewFileVersion } from "@/lib/file-versions";
import { verifyOfficeContentToken, verifyOnlyOfficeRequest } from "@/lib/onlyoffice";
import { isTrustedOnlyOfficeUrl, readBodyLimited } from "@/lib/security";

// Document Server'dan indirilecek kaydedilmiş belge için üst sınır (bellek tüketimini sınırlar).
const MAX_SAVE_BYTES = Number(process.env.ONLYOFFICE_MAX_SAVE_BYTES || 512 * 1024 * 1024);

/**
 * OnlyOffice Document Server'ın belge durumunu bildirmek için çağırdığı callback.
 * Yanıt HER ZAMAN `{ error: 0 }` biçiminde JSON olmalı — aksi halde editör
 * kullanıcıya bir kaydetme hatası gösterir. Durum kodları:
 *   1 = düzenleniyor, 2 = kaydedilmeye hazır, 3 = kaydetme hatası,
 *   4 = değişiklik olmadan kapatıldı, 6/7 = zorla kaydet.
 * bkz. https://api.onlyoffice.com/editors/callback
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const token = new URL(req.url).searchParams.get("token");
    const payload = token ? await verifyOfficeContentToken(token) : null;
    if (!payload || payload.fileId !== id) {
      return NextResponse.json({ error: 1, message: "Geçersiz token" }, { status: 401 });
    }

    const signedOk = await verifyOnlyOfficeRequest(req.headers.get("authorization"));
    if (!signedOk) {
      return NextResponse.json({ error: 1, message: "İmza doğrulanamadı" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { status?: number; url?: string };

    // Sadece "kaydetmeye hazır" (2) ve "zorla kaydet" (6) durumlarında bir şey yapılır.
    if (body.status !== 2 && body.status !== 6) {
      return NextResponse.json({ error: 0 });
    }

    if (!body.url) return NextResponse.json({ error: 0 });

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file || file.deletedAt) return NextResponse.json({ error: 1, message: "Dosya bulunamadı" });

    // Token, dosyayı yalnızca AÇMA (VIEW) yetkisiyle de alınabilir; kaydetme için token sahibinin
    // dosya üzerinde HÂLÂ düzenleme yetkisi olmalı ve hesabı aktif olmalı.
    const editor = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!editor || !editor.active || !(await canAccessFile(editor, id, "EDIT"))) {
      return NextResponse.json({ error: 1, message: "Kaydetme yetkisi yok" }, { status: 403 });
    }

    // SSRF: indirme adresi yalnızca güvenilen Document Server origin'inde olabilir ve yönlendirme izlenmez.
    if (!isTrustedOnlyOfficeUrl(body.url)) {
      return NextResponse.json({ error: 1, message: "Geçersiz indirme adresi" }, { status: 400 });
    }
    const downloaded = await fetch(body.url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if (!downloaded.ok) return NextResponse.json({ error: 1, message: "İçerik indirilemedi" });
    const buffer = await readBodyLimited(downloaded, MAX_SAVE_BYTES);

    try {
      await assertFilePolicy(file.name, BigInt(buffer.byteLength));
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: file.ownerId } });
      // Yeni sürümün tamamı eklenir (eski sürümler de kotaya sayılır).
      await assertQuota(owner, BigInt(buffer.byteLength));
    } catch {
      // Politika/kota reddi: OnlyOffice'e hata bildir, kullanıcı belgeyi kendi
      // tarayıcısında indirip elle kaydedebilir — veri kaybı olmaz.
      return NextResponse.json({ error: 1, message: "Depolama politikası/kotası nedeniyle kaydedilemedi" });
    }

    await saveNewFileVersion(file, buffer, payload.userId, {
      mimeType: mime.lookup(file.name) || file.mimeType,
      auditDetailPrefix: "Office düzenleyici — ",
    });

    return NextResponse.json({ error: 0 });
  } catch {
    return NextResponse.json({ error: 1, message: "Beklenmeyen hata" });
  }
}
