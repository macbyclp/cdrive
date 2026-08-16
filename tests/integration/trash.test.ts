import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { softDeleteFolderRecursive, restoreFolderRecursive, purgeFile } from "@/lib/trash";
import { createTestUser, createTestFolder, createTestFile, cleanupTestData } from "../helpers/db";

let userIds: string[] = [];

afterEach(async () => {
  await cleanupTestData({ userIds });
  userIds = [];
});

describe("softDeleteFolderRecursive — kota muhasebesi (regresyon)", () => {
  // Gerçek prod ortamında bulunan hata: bir klasör silindiğinde içindeki
  // dosyaların usedBytes'ı hiç düşürülmüyordu, kullanıcı kotasını asla geri
  // kazanamıyordu. Bu test tam olarak o senaryoyu yeniden üretir.
  it("klasördeki dosyaların boyutunu sahibinin usedBytes'ından düşürür", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { usedBytes: 500n } });

    const folder = await createTestFolder({ ownerId: owner.id });
    await createTestFile({ ownerId: owner.id, folderId: folder.id, size: 300n });

    await softDeleteFolderRecursive(folder.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(updated.usedBytes).toBe(200n);
  });

  it("alt klasörlerdeki dosyaları da (rekürsif) hesaba katar", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { usedBytes: 1000n } });

    const parent = await createTestFolder({ ownerId: owner.id });
    const child = await createTestFolder({ ownerId: owner.id, parentId: parent.id });
    await createTestFile({ ownerId: owner.id, folderId: parent.id, size: 100n });
    await createTestFile({ ownerId: owner.id, folderId: child.id, size: 250n });

    await softDeleteFolderRecursive(parent.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(updated.usedBytes).toBe(650n); // 1000 - 100 - 250

    const childAfter = await prisma.folder.findUniqueOrThrow({ where: { id: child.id } });
    expect(childAfter.deletedAt).not.toBeNull();
  });

  it("klasörü ve dosyaları deletedAt ile işaretler (kalıcı silmez)", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const folder = await createTestFolder({ ownerId: owner.id });
    const file = await createTestFile({ ownerId: owner.id, folderId: folder.id, size: 50n });

    await softDeleteFolderRecursive(folder.id);

    const folderAfter = await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } });
    const fileAfter = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(folderAfter.deletedAt).not.toBeNull();
    expect(fileAfter.deletedAt).not.toBeNull();
  });
});

describe("restoreFolderRecursive", () => {
  it("silme sırasında düşürülen kotayı simetrik şekilde geri artırır", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { usedBytes: 500n } });

    const folder = await createTestFolder({ ownerId: owner.id });
    await createTestFile({ ownerId: owner.id, folderId: folder.id, size: 300n });

    await softDeleteFolderRecursive(folder.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).usedBytes).toBe(200n);

    await restoreFolderRecursive(folder.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).usedBytes).toBe(500n);

    const folderAfter = await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } });
    expect(folderAfter.deletedAt).toBeNull();
  });
});

describe("purgeFile", () => {
  it("dosyayı ve versiyon kayıtlarını veritabanından kalıcı olarak siler", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const file = await createTestFile({ ownerId: owner.id, size: 10n });

    await purgeFile(file.id);

    const fileAfter = await prisma.file.findUnique({ where: { id: file.id } });
    const versionsAfter = await prisma.fileVersion.findMany({ where: { fileId: file.id } });
    expect(fileAfter).toBeNull();
    expect(versionsAfter).toHaveLength(0);
  });
});
