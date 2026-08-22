import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { canAccessFile } from "@/lib/access";
import { createTestUser, createTestFile, cleanupTestData } from "../helpers/db";

/**
 * Onaya gönderme, onaylayıcıya dosyayı GÖRME hakkı verir — ama sadece görme, ve
 * sadece geri çekilmemiş isteklerde. Bu bir erişim GENİŞLETMESİ olduğu için gerçek
 * veritabanına karşı doğrulanıyor: saf birim testi burada yeterli değil, asıl risk
 * sorgunun yanlış kaydı eşleştirmesi.
 */

let userIds: string[] = [];

afterEach(async () => {
  await prisma.fileApproval.deleteMany({ where: { requestedById: { in: userIds } } });
  await cleanupTestData({ userIds });
  userIds = [];
});

describe("onay akışının erişime etkisi", () => {
  it("onaylayıcı, başka hiçbir izni olmasa da dosyayı GÖREBİLİR", async () => {
    const owner = await createTestUser();
    const approver = await createTestUser();
    userIds.push(owner.id, approver.id);
    const file = await createTestFile({ ownerId: owner.id });

    // Onay isteği YOKKEN erişemiyor.
    expect(await canAccessFile(approver, file.id, "VIEW")).toBe(false);

    await prisma.fileApproval.create({
      data: { fileId: file.id, requestedById: owner.id, approverId: approver.id },
    });

    expect(await canAccessFile(approver, file.id, "VIEW")).toBe(true);
  });

  it("onaylayıcıya sadece VIEW verir, EDIT ASLA", async () => {
    const owner = await createTestUser();
    const approver = await createTestUser();
    userIds.push(owner.id, approver.id);
    const file = await createTestFile({ ownerId: owner.id });

    await prisma.fileApproval.create({
      data: { fileId: file.id, requestedById: owner.id, approverId: approver.id },
    });

    expect(await canAccessFile(approver, file.id, "VIEW")).toBe(true);
    expect(await canAccessFile(approver, file.id, "EDIT")).toBe(false);
  });

  it("karar verildikten sonra da görebilir (denetim izi)", async () => {
    const owner = await createTestUser();
    const approver = await createTestUser();
    userIds.push(owner.id, approver.id);
    const file = await createTestFile({ ownerId: owner.id });

    await prisma.fileApproval.create({
      data: {
        fileId: file.id,
        requestedById: owner.id,
        approverId: approver.id,
        status: "APPROVED",
        decidedAt: new Date(),
      },
    });

    expect(await canAccessFile(approver, file.id, "VIEW")).toBe(true);
  });

  it("istek GERİ ÇEKİLİNCE erişim düşer", async () => {
    const owner = await createTestUser();
    const approver = await createTestUser();
    userIds.push(owner.id, approver.id);
    const file = await createTestFile({ ownerId: owner.id });

    const approval = await prisma.fileApproval.create({
      data: { fileId: file.id, requestedById: owner.id, approverId: approver.id },
    });
    expect(await canAccessFile(approver, file.id, "VIEW")).toBe(true);

    await prisma.fileApproval.update({
      where: { id: approval.id },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });

    expect(await canAccessFile(approver, file.id, "VIEW")).toBe(false);
  });

  it("BAŞKA bir dosyanın onay isteği erişim vermez", async () => {
    // Sorgunun fileId'yi gerçekten filtrelediğini doğrular — kopyala-yapıştır
    // hatasıyla fileId düşerse bu test yakalar.
    const owner = await createTestUser();
    const approver = await createTestUser();
    userIds.push(owner.id, approver.id);
    const onaylanan = await createTestFile({ ownerId: owner.id });
    const digeri = await createTestFile({ ownerId: owner.id });

    await prisma.fileApproval.create({
      data: { fileId: onaylanan.id, requestedById: owner.id, approverId: approver.id },
    });

    expect(await canAccessFile(approver, onaylanan.id, "VIEW")).toBe(true);
    expect(await canAccessFile(approver, digeri.id, "VIEW")).toBe(false);
  });

  it("BAŞKASINA gönderilen onay isteği üçüncü kişiye erişim vermez", async () => {
    const owner = await createTestUser();
    const approver = await createTestUser();
    const yabanci = await createTestUser();
    userIds.push(owner.id, approver.id, yabanci.id);
    const file = await createTestFile({ ownerId: owner.id });

    await prisma.fileApproval.create({
      data: { fileId: file.id, requestedById: owner.id, approverId: approver.id },
    });

    expect(await canAccessFile(yabanci, file.id, "VIEW")).toBe(false);
  });
});
