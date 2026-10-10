// Yapay zekâ aracının kullanıcı adına yüklediği dosya: normal yüklemeyle AYNI kurallar (klasör yetkisi, politika, kota,
// aynı adlıysa yeni sürüm, denetim kaydı) + kullanıcıya "AI_UPLOAD" bildirimi (masaüstü uygulaması bunu tepsi balonuna çevirir).

import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertQuota, canAccessFile, canAccessFolder } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromBuffer, saveNewFileVersion } from "@/lib/file-versions";
import { extractSearchText } from "@/lib/text-extract";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { notifyUser } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export class AgentUploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const MAX_AGENT_UPLOAD_BYTES = (Number(process.env.AGENT_MAX_UPLOAD_MB) > 0 ? Number(process.env.AGENT_MAX_UPLOAD_MB) : 100) * 1024 * 1024;

// Dosya adında yol ayırıcı, Windows'ta yasak karakterler ve kontrol karakterleri olamaz.
const FORBIDDEN_CHARS = String.fromCharCode(92) + "/:*?" + String.fromCharCode(34) + "<>|";

export function validFileName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 200 || n === "." || n === "..") return false;
  for (const ch of n) {
    if (FORBIDDEN_CHARS.includes(ch) || ch.charCodeAt(0) < 32) return false;
  }
  return true;
}

export async function agentUpload(opts: {
  user: User;
  agent: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
  folderId: string | null;
}) {
  const { user, agent, buffer, folderId } = opts;
  const name = opts.name.trim();
  if (!validFileName(name)) throw new AgentUploadError("Geçersiz dosya adı");
  if (buffer.byteLength === 0) throw new AgentUploadError("Dosya boş");
  if (buffer.byteLength > MAX_AGENT_UPLOAD_BYTES) throw new AgentUploadError("Dosya çok büyük", 413);
  if (folderId && !(await canAccessFolder(user, folderId, "EDIT"))) throw new AgentUploadError("Bu klasöre yükleme izniniz yok", 403);

  const size = BigInt(buffer.byteLength);
  await assertFilePolicy(name, size);

  // Kökte yalnızca kullanıcının KENDİ aynı adlı dosyası eşleşir (başkasının kök dosyasının üzerine yazılmaz).
  const existing = await prisma.file.findFirst({
    where: { folderId, name, deletedAt: null, ...(folderId === null ? { ownerId: user.id } : {}) },
  });

  let fileId: string;
  let versioned = false;
  if (existing) {
    if (!(await canAccessFile(user, existing.id, "EDIT"))) throw new AgentUploadError("Aynı adlı dosyayı değiştirme izniniz yok", 403);
    const { file } = await saveNewFileVersion(existing, buffer, user.id, { mimeType: opts.mimeType || existing.mimeType });
    fileId = file.id;
    versioned = true;
  } else {
    await assertQuota(user, size);
    const searchText = await extractSearchText(buffer, opts.mimeType);
    const file = await createFileFromBuffer({ name, mimeType: opts.mimeType, folderId, ownerId: user.id, buffer, searchText });
    fileId = file.id;
    await notifyIfQuotaWarning(user.id);
  }

  await logAudit({ userId: user.id, action: "UPLOAD", targetType: "file", targetId: fileId, detail: `${name} (${agent})` });
  await notifyUser({
    userId: user.id,
    type: "AI_UPLOAD",
    message: versioned ? `${agent} "${name}" dosyasının yeni sürümünü yükledi` : `${agent} sürücünüze "${name}" yükledi`,
    // Tıklayınca dosyanın bulunduğu klasör açılır (kökteyse sürücü ana sayfası).
    targetType: folderId ? "folder" : "drive_root",
    targetId: folderId,
  });
  return { id: fileId, name, size: buffer.byteLength, versioned, folderId };
}
