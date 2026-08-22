import type { ApprovalStatus } from "@prisma/client";

/**
 * Belge onay akışının kuralları — TEK KAYNAK.
 *
 * Kural mantığı bilerek SAF fonksiyonlar olarak burada duruyor (DB'ye dokunmuyor):
 * rotalar sadece kaydı çekip bu fonksiyonlara soruyor. Böylece "kim ne yapabilir"
 * soruları veritabanı kurmadan test edilebiliyor ve iki rota (karar verme / geri
 * çekme) aynı kuralı iki farklı şekilde yorumlayamıyor.
 */

/** Karar verilmiş (artık üzerinde işlem yapılamayan) durumlar. */
export function isDecided(status: ApprovalStatus): boolean {
  return status !== "PENDING";
}

export type ApprovalActor = { id: string; role: string };
export type ApprovalRecord = {
  status: ApprovalStatus;
  requestedById: string;
  approverId: string;
};

/**
 * Karar verebilir mi (onayla/reddet)?
 *
 * SADECE atanan onaylayıcı — ADMIN İSTİSNASI BİLEREK YOK. Onay, belirli bir kişinin
 * iradesini kaydeden bir eylem; admin'in "her şeyi görebilir" yetkisi "herkesin
 * yerine imza atabilir" anlamına gelmemeli. Admin gerekirse isteği iptal edip
 * yenisini açabilir (bkz. canCancel).
 */
export function canDecide(actor: ApprovalActor, approval: ApprovalRecord): boolean {
  if (isDecided(approval.status)) return false;
  return approval.approverId === actor.id;
}

/**
 * Geri çekebilir mi?
 *
 * İsteği açan kişi kendi isteğini geri çekebilir. ADMIN de çekebilir — burada admin
 * istisnası VAR çünkü bu bir "karar" değil, yanlış/unutulmuş bir isteği temizleme
 * işlemi (ör. onaylayıcı işten ayrıldı ve istek sonsuza kadar bekliyor).
 */
export function canCancel(actor: ApprovalActor, approval: ApprovalRecord): boolean {
  if (isDecided(approval.status)) return false;
  return approval.requestedById === actor.id || actor.role === "ADMIN";
}

/**
 * Onaya gönderirken kendini onaylayıcı seçebilir mi? Hayır — kendi kendini
 * onaylamak akışı anlamsız kılar.
 */
export function isValidApproverChoice(requesterId: string, approverId: string): boolean {
  return requesterId !== approverId;
}

/**
 * Onaya göndermek, onaylayıcıya dosyayı GÖRME hakkı verir mi?
 *
 * Evet — ve bu hak istek karara bağlandıktan SONRA da sürer: onaylayan kişi neyi
 * onayladığını sonradan görebilmeli (denetim izi). Sadece istek GERİ ÇEKİLDİĞİNDE
 * düşer, çünkü o durumda ortada onaylanmış bir belge yok.
 */
export function grantsViewToApprover(status: ApprovalStatus): boolean {
  return status !== "CANCELLED";
}

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Onay bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "Geri çekildi",
};
