import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { assertFilePolicy, maxUploadBytes } from "@/lib/policy";
import { createFileFromStored } from "@/lib/file-versions";
import { deleteFile } from "@/lib/storage";
import { parseSingleFileUpload, UploadTooLargeError } from "@/lib/upload-stream";
import { errorResponse, clientIp, limitOr429 } from "@/lib/api-helpers";
import { sanitizeUploadName, uniqueName, uploadRequestStatus } from "@/lib/upload-request";

// Herkese açık (oturumsuz) yükleme: yalnızca isteği oluşturanın seçtiği klasöre, tek istekte tek dosya.
// Şifre gövdeden DEĞİL `x-upload-password` başlığından okunur: gövde (dosya) okunup diske yazılmadan ÖNCE
// doğrulanabilsin; kimliği doğrulanmamış biri şifresiz dosya yazdıramasın. Bu rota proxy matcher'ından
// muaftır (büyük gövde kesilmesin — bkz. src/proxy.ts), oturum zaten gerekmediği için kapı kaybı yoktur.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  let claimedId: string | null = null;
  let storageKey: string | null = null;
  try {
    const ip = clientIp(req) ?? "unknown";
    const limited = limitOr429("upload-request", ip, 60, 60_000);
    if (limited) return limited;

    const { token } = await params;
    const r = await prisma.uploadRequest.findUnique({ where: { token } });
    const gate = uploadRequestStatus(r);
    if (!r || !gate.ok) {
      return NextResponse.json({ error: gate.ok ? "Bağlantı geçersiz veya iptal edilmiş" : gate.error }, { status: gate.ok ? 404 : gate.status });
    }

    if (r.passwordHash) {
      const pwLimited = limitOr429("upload-request-pw", `${token}:${ip}`, 10, 60_000);
      if (pwLimited) return pwLimited;
      const given = req.headers.get("x-upload-password") ?? "";
      if (!given || !(await verifyPassword(given, r.passwordHash))) {
        return NextResponse.json({ error: "Şifre gerekli veya hatalı", requiresPassword: true }, { status: 401 });
      }
    }

    const maxBytes = Math.min(Number(r.maxFileBytes), await maxUploadBytes());
    // Gövde okunmadan boyut reddi (Content-Length yalan söyleyebilir; asıl sınır akış sırasında uygulanır).
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes + 1024 * 1024) {
      return NextResponse.json({ error: "Dosya izin verilen boyut sınırını aşıyor" }, { status: 413 });
    }

    // Kontenjan atomik alınır: eşzamanlı isteklerle maxFiles aşılamaz. Başarısızlıkta geri verilir.
    // Süre, MySQL'in NOW()'una DEĞİL uygulamanın UTC anına karşı denetlenir: Prisma DATETIME'ı UTC yazar,
    // sunucu saat dilimi UTC değilse NOW() karşılaştırması kayardı.
    const claimed = await prisma.$executeRaw`
      UPDATE upload_requests SET uploadCount = uploadCount + 1
      WHERE id = ${r.id} AND revoked = 0 AND expiresAt > ${new Date()} AND uploadCount < maxFiles`;
    if (claimed === 0) {
      return NextResponse.json({ error: "Bu istek artık dosya kabul etmiyor" }, { status: 410 });
    }
    claimedId = r.id;

    const upload = await parseSingleFileUpload(req, maxBytes);
    if (!upload.file) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
    storageKey = upload.file.storageKey;
    const rawName = sanitizeUploadName(upload.file.name);
    const size = BigInt(upload.file.size);
    if (size === 0n) return NextResponse.json({ error: "Boş dosya yüklenemez" }, { status: 400 });

    const [owner, folder] = await Promise.all([
      prisma.user.findUnique({ where: { id: r.createdById } }),
      prisma.folder.findUnique({ where: { id: r.folderId } }),
    ]);
    if (!owner || !owner.active || !folder || folder.deletedAt) {
      return NextResponse.json({ error: "Bu istek artık geçerli değil" }, { status: 410 });
    }
    await assertFilePolicy(rawName, size);

    const taken = await prisma.file.findMany({ where: { folderId: r.folderId, deletedAt: null }, select: { name: true } });
    const name = uniqueName(rawName, taken.map((f) => f.name));
    const mimeType = upload.file.mimeType || "application/octet-stream";

    const key = storageKey;
    storageKey = null; // createFileFromStored sahipliği devraldı: hata olursa o siler
    const file = await createFileFromStored({ name, mimeType, folderId: r.folderId, ownerId: r.createdById, storageKey: key, size, searchText: null });
    claimedId = null; // başarı: kontenjan harcandı

    await logAudit({ ip: clientIp(req), action: "UPLOAD", targetType: "file", targetId: file.id, detail: `dosya isteği "${r.title}": ${name}` });
    void notifyUser({
      userId: r.createdById,
      type: "UPLOAD_RECEIVED",
      message: `"${r.title}" isteğine "${name}" yüklendi`,
      // Bildirime tıklayınca dosyanın düştüğü klasör açılır (bkz. NotificationBell).
      targetType: "folder",
      targetId: r.folderId,
    }).catch(() => {});
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return NextResponse.json({ error: "Dosya izin verilen boyut sınırını aşıyor" }, { status: 413 });
    }
    return errorResponse(err);
  } finally {
    if (storageKey) await deleteFile(storageKey).catch(() => {});
    if (claimedId) {
      await prisma.$executeRaw`UPDATE upload_requests SET uploadCount = GREATEST(uploadCount - 1, 0) WHERE id = ${claimedId}`.catch(() => {});
    }
  }
}
