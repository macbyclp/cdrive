export type MeUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  department: string | null;
  usedBytes: string;
  quotaBytes: string;
  twoFactorEnabled: boolean;
  uiSkin: "modern" | "archive" | "panel";
  canCreateOrders: boolean;
  canManageOrders: boolean;
  canManageProduction: boolean;
  avatarKey: string | null;
  avatarParts: string | null;
  hasSeenFeatureTour: boolean;
};

export type Tag = { id: string; name: string; color: string };

export type FolderItem = {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
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
  tags?: Tag[];
};

export type Crumb = { id: string; name: string };
