import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { canAccessFolder, canAccessFile, assertQuota } from "@/lib/access";
import { createTestUser, createTestFolder, createTestFile, cleanupTestData } from "../helpers/db";

let userIds: string[] = [];
let departmentIds: string[] = [];

afterEach(async () => {
  await cleanupTestData({ userIds, departmentIds });
  userIds = [];
  departmentIds = [];
});

describe("canAccessFolder — sahiplik ve kalıtım", () => {
  it("sahibine her zaman EDIT erişimi verir", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const folder = await createTestFolder({ ownerId: owner.id });

    expect(await canAccessFolder(owner, folder.id, "VIEW")).toBe(true);
    expect(await canAccessFolder(owner, folder.id, "EDIT")).toBe(true);
  });

  it("ilgisiz bir kullanıcıya erişim vermez", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    userIds.push(owner.id, stranger.id);
    const folder = await createTestFolder({ ownerId: owner.id });

    expect(await canAccessFolder(stranger, folder.id, "VIEW")).toBe(false);
  });

  it("üst klasöre verilen izin alt klasörlere kalıtım yoluyla geçer", async () => {
    const owner = await createTestUser();
    const collaborator = await createTestUser();
    userIds.push(owner.id, collaborator.id);

    const parent = await createTestFolder({ ownerId: owner.id });
    const child = await createTestFolder({ ownerId: owner.id, parentId: parent.id });
    const grandchild = await createTestFolder({ ownerId: owner.id, parentId: child.id });

    await prisma.folderPermission.create({
      data: { folderId: parent.id, userId: collaborator.id, permission: "VIEW" },
    });

    // İzin sadece parent'a verildi ama grandchild'a kadar (yukarı doğru yürüyerek) geçmeli.
    expect(await canAccessFolder(collaborator, grandchild.id, "VIEW")).toBe(true);
    expect(await canAccessFolder(collaborator, grandchild.id, "EDIT")).toBe(false);
  });

  it("EDIT izni VIEW gereksinimini de karşılar ama tersi olmaz", async () => {
    const owner = await createTestUser();
    const editor = await createTestUser();
    const viewer = await createTestUser();
    userIds.push(owner.id, editor.id, viewer.id);
    const folder = await createTestFolder({ ownerId: owner.id });

    await prisma.folderPermission.create({ data: { folderId: folder.id, userId: editor.id, permission: "EDIT" } });
    await prisma.folderPermission.create({ data: { folderId: folder.id, userId: viewer.id, permission: "VIEW" } });

    expect(await canAccessFolder(editor, folder.id, "VIEW")).toBe(true);
    expect(await canAccessFolder(viewer, folder.id, "EDIT")).toBe(false);
  });

  it("MANAGER, kendi departmanındaki klasörlere EDIT erişimine sahiptir", async () => {
    const dept = await prisma.department.create({ data: { name: `dept-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
    departmentIds.push(dept.id);
    const owner = await createTestUser();
    const manager = await createTestUser({ role: "MANAGER", departmentId: dept.id });
    userIds.push(owner.id, manager.id);

    const folder = await createTestFolder({ ownerId: owner.id, departmentId: dept.id });
    expect(await canAccessFolder(manager, folder.id, "EDIT")).toBe(true);
  });

  it("MANAGER, farklı departmanın klasörüne erişemez", async () => {
    const deptA = await prisma.department.create({ data: { name: `dept-a-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
    const deptB = await prisma.department.create({ data: { name: `dept-b-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
    departmentIds.push(deptA.id, deptB.id);
    const owner = await createTestUser();
    const manager = await createTestUser({ role: "MANAGER", departmentId: deptB.id });
    userIds.push(owner.id, manager.id);

    const folder = await createTestFolder({ ownerId: owner.id, departmentId: deptA.id });
    expect(await canAccessFolder(manager, folder.id, "EDIT")).toBe(false);
  });

  it("ADMIN her klasöre EDIT erişimine sahiptir", async () => {
    const owner = await createTestUser();
    const admin = await createTestUser({ role: "ADMIN" });
    userIds.push(owner.id, admin.id);
    const folder = await createTestFolder({ ownerId: owner.id });

    expect(await canAccessFolder(admin, folder.id, "EDIT")).toBe(true);
  });
});

describe("canAccessFile", () => {
  it("dosyanın bulunduğu klasöre verilen izin dosyaya da uygulanır", async () => {
    const owner = await createTestUser();
    const collaborator = await createTestUser();
    userIds.push(owner.id, collaborator.id);

    const folder = await createTestFolder({ ownerId: owner.id });
    const file = await createTestFile({ ownerId: owner.id, folderId: folder.id });
    await prisma.folderPermission.create({
      data: { folderId: folder.id, userId: collaborator.id, permission: "VIEW" },
    });

    expect(await canAccessFile(collaborator, file.id, "VIEW")).toBe(true);
    expect(await canAccessFile(collaborator, file.id, "EDIT")).toBe(false);
  });

  it("ilgisiz bir kullanıcıya dosya erişimi vermez", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    userIds.push(owner.id, stranger.id);
    const file = await createTestFile({ ownerId: owner.id });

    expect(await canAccessFile(stranger, file.id, "VIEW")).toBe(false);
  });
});

describe("assertQuota", () => {
  it("kota aşılmadığında hata fırlatmaz", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await expect(assertQuota(user, 100n)).resolves.toBeUndefined();
  });

  it("kota aşıldığında 413 durum koduyla hata fırlatır", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    await expect(assertQuota(user, user.quotaBytes + 1n)).rejects.toMatchObject({ status: 413 });
  });
});
