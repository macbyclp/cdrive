import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUnrestrictedUser } from "@/lib/auth";
import { canAccessFolder, canAccessFile, assertQuota } from "@/lib/access";
import { assertFilePolicy, maxUploadBytes } from "@/lib/policy";
import { saveNewFileVersionFromStored, createFileFromStored, searchTextForStored } from "@/lib/file-versions";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { logAudit } from "@/lib/audit";
import { deleteFile } from "@/lib/storage";
import { parseSingleFileUpload, UploadTooLargeError } from "@/lib/upload-stream";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const user = await requireUnrestrictedUser();
    const limited = limitOr429("upload", user.id, 300, 60000);
    if (limited) return limited;

    // Dosya belleğe alınmadan doğrudan diske akıtılır (bkz. lib/upload-stream.ts). İstemci `file` alanını
    // `folderId`'den ÖNCE gönderdiği için yetki kontrolü yazmadan sonra yapılır; reddedilirse dosya silinir.
    const maxBytes = await maxUploadBytes();
    let upload;
    try {
      upload = await parseSingleFileUpload(req, maxBytes);
    } catch (e) {
      if (e instanceof UploadTooLargeError) {
        // Sınırı yönetici politikası koyduysa net mesajı politika üretir (boyut/uzantı), değilse genel 413.
        await assertFilePolicy(e.fileName, BigInt(maxBytes) + 1n);
      }
      throw e;
    }
    if (!upload.file) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
    }

    const { name, storageKey } = upload.file;
    const size = BigInt(upload.file.size);
    const folderId = upload.fields.folderId ? upload.fields.folderId : null;
    // Tarayıcı türü bilmediğinde application/octet-stream gönderir; eski davranış (boş tür) korunur.
    const clientMime = upload.file.mimeType === "application/octet-stream" ? "" : upload.file.mimeType;

    // storageKey, saveNewFileVersionFromStored/createFileFromStored'a verilene kadar bu fonksiyonun
    // sorumluluğundadır: önce bir hata olursa diskteki dosya silinir (yetim dosya kalmaz).
    let handedOff = false;
    try {
      if (folderId) {
        const ok = await canAccessFolder(user, folderId, "EDIT");
        if (!ok) return NextResponse.json({ error: "Bu klasöre yükleme izniniz yok" }, { status: 403 });
      }

      await assertFilePolicy(name, size);

      // Aynı klasörde aynı isimde dosya varsa -> yeni versiyon olarak ekle
      // (kota, dosyanın SAHİBİNE karşı ve kilit altında saveNewFileVersionFromStored içinde kontrol edilir).
      // Kök dizin herkesin ortak alanı DEĞİL: kökte yalnızca kullanıcının KENDİ dosyası eşleşir
      // (aksi halde başkasının aynı adlı kök dosyasının üzerine yazılırdı).
      const existing = await prisma.file.findFirst({
        where: { folderId, name, deletedAt: null, ...(folderId === null ? { ownerId: user.id } : {}) },
      });

      if (existing) {
        if (!(await canAccessFile(user, existing.id, "EDIT"))) {
          return NextResponse.json({ error: "Aynı adlı dosyayı değiştirme izniniz yok" }, { status: 403 });
        }
        const mimeType = clientMime || existing.mimeType;
        const searchText = await searchTextForStored(storageKey, mimeType, size);
        handedOff = true;
        const { file: updated } = await saveNewFileVersionFromStored(existing, { storageKey, size, searchText }, user.id, { mimeType });
        return NextResponse.json(serialize(updated));
      }

      await assertQuota(user, size); // erken ret (asıl kontrol transaction içinde)
      const mimeType = clientMime || "application/octet-stream";
      const searchText = await searchTextForStored(storageKey, mimeType, size);
      handedOff = true;
      const finalFile = await createFileFromStored({ name, mimeType, folderId, ownerId: user.id, storageKey, size, searchText });
      await notifyIfQuotaWarning(user.id);
      await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: finalFile.id, detail: name });
      return NextResponse.json(serialize(finalFile));
    } finally {
      if (!handedOff) await deleteFile(storageKey).catch(() => {});
    }
  } catch (err) {
    return errorResponse(err);
  }
}

function serialize(f: { size: bigint; searchText?: unknown; [k: string]: unknown }) {
  return { ...f, size: f.size.toString(), searchText: undefined };
}
