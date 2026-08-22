import { describe, it, expect } from "vitest";
import {
  isDecided,
  canDecide,
  canCancel,
  isValidApproverChoice,
  grantsViewToApprover,
  APPROVAL_STATUS_LABEL,
} from "@/lib/approvals";
import type { ApprovalStatus } from "@prisma/client";

/**
 * Belge onay akışının yetki kuralları. Buradaki en kritik iddia "admin başkasının
 * yerine onaylayamaz" — bu bilinçli bir ürün kararı ve kolayca yanlışlıkla
 * gevşetilebilecek türden, o yüzden ayrı ayrı sabitleniyor.
 */

const ISTEYEN = "user-isteyen";
const ONAYLAYAN = "user-onaylayan";
const YABANCI = "user-yabanci";

function approval(over: Partial<{ status: ApprovalStatus; requestedById: string; approverId: string }> = {}) {
  return {
    status: "PENDING" as ApprovalStatus,
    requestedById: ISTEYEN,
    approverId: ONAYLAYAN,
    ...over,
  };
}

const uye = (id: string) => ({ id, role: "MEMBER" });
const admin = (id: string) => ({ id, role: "ADMIN" });

describe("isDecided", () => {
  it("PENDING karara bağlanmamıştır", () => {
    expect(isDecided("PENDING")).toBe(false);
  });

  it("diğer tüm durumlar karara bağlanmıştır", () => {
    for (const s of ["APPROVED", "REJECTED", "CANCELLED"] as ApprovalStatus[]) {
      expect(isDecided(s)).toBe(true);
    }
  });
});

describe("canDecide — onayla/reddet yetkisi", () => {
  it("atanan onaylayıcı karar verebilir", () => {
    expect(canDecide(uye(ONAYLAYAN), approval())).toBe(true);
  });

  it("isteği açan kişi KENDİ isteğini karara bağlayamaz", () => {
    expect(canDecide(uye(ISTEYEN), approval())).toBe(false);
  });

  it("ilgisiz bir kullanıcı karar veremez", () => {
    expect(canDecide(uye(YABANCI), approval())).toBe(false);
  });

  it("ADMIN başkasının yerine karar VEREMEZ", () => {
    // Bilinçli karar: onay bir kişinin iradesini kaydeder. Admin'in "her şeyi
    // görebilir" yetkisi "herkesin yerine imza atabilir" anlamına gelmemeli.
    expect(canDecide(admin(YABANCI), approval())).toBe(false);
  });

  it("onaylayıcı ADMIN ise elbette karar verebilir (kendi isteği olduğu için)", () => {
    expect(canDecide(admin(ONAYLAYAN), approval())).toBe(true);
  });

  it("zaten karara bağlanmış isteğe tekrar karar verilemez", () => {
    for (const s of ["APPROVED", "REJECTED", "CANCELLED"] as ApprovalStatus[]) {
      expect(canDecide(uye(ONAYLAYAN), approval({ status: s }))).toBe(false);
    }
  });
});

describe("canCancel — geri çekme yetkisi", () => {
  it("isteği açan kişi geri çekebilir", () => {
    expect(canCancel(uye(ISTEYEN), approval())).toBe(true);
  });

  it("ADMIN geri çekebilir (bu bir karar değil, temizlik)", () => {
    // canDecide'ın aksine burada admin istisnası VAR — ör. onaylayıcı işten
    // ayrıldıysa istek sonsuza kadar bekler kalır.
    expect(canCancel(admin(YABANCI), approval())).toBe(true);
  });

  it("onaylayıcı geri ÇEKEMEZ (kararını vermeli)", () => {
    expect(canCancel(uye(ONAYLAYAN), approval())).toBe(false);
  });

  it("ilgisiz kullanıcı geri çekemez", () => {
    expect(canCancel(uye(YABANCI), approval())).toBe(false);
  });

  it("karara bağlanmış istek geri çekilemez — ADMIN bile", () => {
    expect(canCancel(admin(YABANCI), approval({ status: "APPROVED" }))).toBe(false);
    expect(canCancel(uye(ISTEYEN), approval({ status: "REJECTED" }))).toBe(false);
  });
});

describe("isValidApproverChoice", () => {
  it("başka birini onaylayıcı seçmek geçerli", () => {
    expect(isValidApproverChoice(ISTEYEN, ONAYLAYAN)).toBe(true);
  });

  it("kendini onaylayıcı seçmek geçersiz", () => {
    expect(isValidApproverChoice(ISTEYEN, ISTEYEN)).toBe(false);
  });
});

describe("grantsViewToApprover — onaylayıcının görme hakkı", () => {
  it("bekleyen istekte görebilir (yoksa neyi onaylayacağını açamaz)", () => {
    expect(grantsViewToApprover("PENDING")).toBe(true);
  });

  it("karar verdikten SONRA da görebilir (denetim izi)", () => {
    expect(grantsViewToApprover("APPROVED")).toBe(true);
    expect(grantsViewToApprover("REJECTED")).toBe(true);
  });

  it("geri çekilmiş istekte göremez", () => {
    expect(grantsViewToApprover("CANCELLED")).toBe(false);
  });
});

describe("APPROVAL_STATUS_LABEL", () => {
  it("her durum için Türkçe etiket var", () => {
    for (const s of ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as ApprovalStatus[]) {
      expect(APPROVAL_STATUS_LABEL[s]).toBeTruthy();
    }
  });
});
