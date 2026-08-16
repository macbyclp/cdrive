import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { Role } from "@prisma/client";

/** Test verilerini birbirinden ayırmak için her çalıştırmaya özel bir önek. */
export function testTag() {
  return `test-${randomUUID().slice(0, 8)}`;
}

export async function createTestUser(opts: { role?: Role; departmentId?: string | null } = {}) {
  const tag = testTag();
  return prisma.user.create({
    data: {
      email: `${tag}@example.test`,
      name: tag,
      passwordHash: "not-used-in-tests",
      role: opts.role ?? "MEMBER",
      departmentId: opts.departmentId ?? null,
    },
  });
}

export async function createTestFolder(opts: {
  ownerId: string;
  parentId?: string | null;
  departmentId?: string | null;
  name?: string;
}) {
  return prisma.folder.create({
    data: {
      name: opts.name ?? testTag(),
      ownerId: opts.ownerId,
      parentId: opts.parentId ?? null,
      departmentId: opts.departmentId ?? null,
    },
  });
}

export async function createTestFile(opts: {
  ownerId: string;
  folderId?: string | null;
  size?: bigint;
  name?: string;
}) {
  const file = await prisma.file.create({
    data: {
      name: opts.name ?? `${testTag()}.txt`,
      mimeType: "text/plain",
      size: opts.size ?? 100n,
      ownerId: opts.ownerId,
      folderId: opts.folderId ?? null,
    },
  });
  const version = await prisma.fileVersion.create({
    data: {
      fileId: file.id,
      versionNo: 1,
      storageKey: `test-${randomUUID()}`,
      size: file.size,
      uploadedById: opts.ownerId,
    },
  });
  return prisma.file.update({ where: { id: file.id }, data: { currentVersionId: version.id } });
}

/** Bir test çalışması sırasında oluşturulan tüm kayıtları (id listeleriyle) temizler. */
export async function cleanupTestData(opts: { userIds?: string[]; departmentIds?: string[] } = {}) {
  if (opts.userIds?.length) {
    // Folder/File cascade'leri (onDelete: Cascade tanımlı ilişkiler için) devreye girer;
    // klasör/dosya ağacı kullanıcı silinmeden önce ayrıca temizlenmeli çünkü
    // Folder/File.ownerId ilişkisinde cascade tanımlı değil.
    await prisma.file.deleteMany({ where: { ownerId: { in: opts.userIds } } });
    await prisma.folder.deleteMany({ where: { ownerId: { in: opts.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: opts.userIds } } });
  }
  if (opts.departmentIds?.length) {
    await prisma.department.deleteMany({ where: { id: { in: opts.departmentIds } } });
  }
}
