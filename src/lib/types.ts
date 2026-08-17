export type MeUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  department: string | null;
  usedBytes: string;
  quotaBytes: string;
  twoFactorEnabled: boolean;
  uiSkin: "modern" | "archive";
};

export type FolderItem = {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FileItem = {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  folderId: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Crumb = { id: string; name: string };
