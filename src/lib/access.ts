import { prisma } from "@/lib/prisma";
import type { User, Permission } from "@prisma/client";
import { quotaError } from "@/lib/quota";

const rank: Record<Permission, number> = { VIEW: 1, EDIT: 2 };

function sufficient(have: Permission, need: Permission) {
  return rank[have] >= rank[need];
}

/** Bir klasör (ve üstündeki tüm ataları) üzerinde kullanıcının izin seviyesini döner, yoksa null. */
export async function folderPermissionLevel(
  user: User,
  folderId: string | null
): Promise<Permission | null> {
  if (!folderId) return "EDIT"; // kök seviyesi: herkes kendi kökünde çalışabilir
  if (user.role === "ADMIN") return "EDIT";

  let current = await prisma.folder.findUnique({ where: { id: folderId } });
  let best: Permission | null = null;

  while (current) {
    if (current.ownerId === user.id) return "EDIT";
    if (
      user.role === "MANAGER" &&
      current.departmentId &&
      current.departmentId === user.departmentId
    ) {
      return "EDIT";
    }
    const grant = await prisma.folderPermission.findUnique({
      where: { folderId_userId: { folderId: current.id, userId: user.id } },
    });
    if (grant && (!best || sufficient(grant.permission, best))) {
      best = grant.permission;
    }
    if (!current.parentId) break;
    current = await prisma.folder.findUnique({ where: { id: current.parentId } });
  }
  return best;
}

export async function canAccessFolder(user: User, folderId: string | null, need: Permission) {
  const level = await folderPermissionLevel(user, folderId);
  return level !== null && sufficient(level, need);
}

export async function filePermissionLevel(user: User, fileId: string): Promise<Permission | null> {
  if (user.role === "ADMIN") return "EDIT";

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  if (file.ownerId === user.id) return "EDIT";

  const direct = await prisma.filePermission.findUnique({
    where: { fileId_userId: { fileId, userId: user.id } },
  });

  // ÖNEMLİ: folderPermissionLevel(user, null) kasıtlı olarak "EDIT" döner ama bu
  // sadece "kullanıcı kendi KÖKÜNDE yeni bir şey oluşturabilir mi" sorusu içindir.
  // file.folderId null ise dosya birinin kökündedir — ama HANGİ kullanıcının
  // olduğu burada bilinmiyor; o kısayolu burada çağırmak sahiplik/paylaşım fark
  // etmeksizin herkese EDIT verirdi (gerçek bir IDOR açığıydı, testlerle bulundu
  // ve düzeltildi — bkz. 2026-08-16 günlüğü).
  const folderLevel = file.folderId ? await folderPermissionLevel(user, file.folderId) : null;

  const levels = [direct?.permission, folderLevel].filter(Boolean) as Permission[];
  if (levels.length > 0) {
    return levels.includes("EDIT") ? "EDIT" : "VIEW";
  }

  // Onaya gönderilmiş bir belgeyi, onaylayıcının klasör/paylaşım izni olmasa bile
  // GÖREBİLMESİ gerekir — yoksa "onayla" diyeceği şeyi açamaz. Sohbete dosya ekleme
  // ile aynı mantık: birine onaya göndermek fiilen o kişiyle paylaşmak demek.
  // Sadece VIEW verir (EDIT asla) ve geri çekilmiş (CANCELLED) istekler saymaz.
  const asApprover = await prisma.fileApproval.findFirst({
    where: { fileId, approverId: user.id, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (asApprover) return "VIEW";

  return null;
}

/**
 * Verilen dosyalardan `user`'ın EN AZ görüntüleme (VIEW) yetkisi olanların id kümesini döner.
 * `filePermissionLevel` ile aynı kuralları uygular ama dosya başına ayrı sorgu ATMAZ (N+1 yok):
 * doğrudan izinler, onay atamaları ve klasör ataları toplu sorgularla (sorgu sayısı ≈ klasör derinliği) çözülür.
 */
export async function visibleFileIds(
  user: User,
  files: { id: string; ownerId: string; folderId: string | null }[]
): Promise<Set<string>> {
  const visible = new Set<string>();
  if (user.role === "ADMIN") return new Set(files.map((f) => f.id));
  const pending = files.filter((f) => {
    if (f.ownerId === user.id) {
      visible.add(f.id);
      return false;
    }
    return true;
  });
  if (pending.length === 0) return visible;
  const ids = pending.map((f) => f.id);

  const [direct, approver] = await Promise.all([
    prisma.filePermission.findMany({ where: { userId: user.id, fileId: { in: ids } }, select: { fileId: true } }),
    prisma.fileApproval.findMany({
      where: { approverId: user.id, fileId: { in: ids }, status: { not: "CANCELLED" } },
      select: { fileId: true },
    }),
  ]);
  for (const d of direct) visible.add(d.fileId);
  for (const a of approver) visible.add(a.fileId);

  // Klasör atalarını seviye seviye topla.
  type F = { id: string; parentId: string | null; ownerId: string; departmentId: string | null };
  const folderMap = new Map<string, F>();
  let frontier = [...new Set(pending.map((f) => f.folderId).filter((x): x is string => !!x))];
  while (frontier.length) {
    const rows = await prisma.folder.findMany({
      where: { id: { in: frontier } },
      select: { id: true, parentId: true, ownerId: true, departmentId: true },
    });
    for (const r of rows) folderMap.set(r.id, r);
    frontier = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x && !folderMap.has(x)))];
  }
  const grants = folderMap.size
    ? await prisma.folderPermission.findMany({
        where: { userId: user.id, folderId: { in: [...folderMap.keys()] } },
        select: { folderId: true },
      })
    : [];
  const granted = new Set(grants.map((g) => g.folderId));

  const memo = new Map<string, boolean>();
  const folderVisible = (folderId: string): boolean => {
    const cached = memo.get(folderId);
    if (cached !== undefined) return cached;
    let result = false;
    let cur = folderMap.get(folderId);
    const chain: string[] = [];
    while (cur) {
      chain.push(cur.id);
      const known = memo.get(cur.id);
      if (known !== undefined) { result = known; break; }
      if (
        cur.ownerId === user.id ||
        granted.has(cur.id) ||
        (user.role === "MANAGER" && !!cur.departmentId && cur.departmentId === user.departmentId)
      ) { result = true; break; }
      cur = cur.parentId ? folderMap.get(cur.parentId) : undefined;
    }
    for (const c of chain) memo.set(c, result);
    return result;
  };
  for (const f of pending) {
    if (!visible.has(f.id) && f.folderId && folderVisible(f.folderId)) visible.add(f.id);
  }
  return visible;
}

/**
 * Sayfa sayfa aday çekip yetki filtresinden geçirerek `limit` görünür sonuç toplar. Eski yaklaşım
 * (ilk N adayı çek, sonra süz) yetkisiz adaylar yüzünden sonuçları eksik bırakabiliyordu.
 */
export async function collectVisibleFiles<T extends { id: string; ownerId: string; folderId: string | null }>(
  user: User,
  fetchPage: (skip: number, take: number) => Promise<T[]>,
  limit: number,
  opts: { pageSize?: number; maxScan?: number } = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 200;
  const maxScan = opts.maxScan ?? 2000;
  const out: T[] = [];
  const seen = new Set<string>();
  for (let skip = 0; skip < maxScan && out.length < limit; skip += pageSize) {
    const page = await fetchPage(skip, pageSize);
    if (page.length === 0) break;
    const fresh = page.filter((f) => !seen.has(f.id));
    fresh.forEach((f) => seen.add(f.id));
    const ok = await visibleFileIds(user, fresh);
    for (const f of fresh) {
      if (ok.has(f.id)) out.push(f);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function canAccessFile(user: User, fileId: string, need: Permission) {
  const level = await filePermissionLevel(user, fileId);
  return level !== null && sufficient(level, need);
}

/**
 * Kullanıcının (ve varsa departmanının) kotasına `addBytes` daha sığar mı kontrol eder.
 * Departman kontrolü: departmandaki tüm kullanıcıların kullanım toplamı + eklenecek bayt,
 * `Department.quotaBytes`'ı aşamaz (0 = sınırsız). `db` verilirse (transaction) taze kullanım
 * o bağlantıdan okunur — kilit altında çağrılmalıdır.
 */
export async function assertQuota(user: User, addBytes: bigint, db: Pick<typeof prisma, "user" | "department"> = prisma) {
  const fresh = (await db.user.findUnique({ where: { id: user.id } })) ?? user;
  const projected = fresh.usedBytes + addBytes;
  if (projected > fresh.quotaBytes) {
    throw quotaError(
      `Depolama kotası aşıldı: ${formatBytes(fresh.usedBytes)} / ${formatBytes(fresh.quotaBytes)} kullanımda.`
    );
  }
  if (fresh.departmentId && addBytes > 0n) {
    const dept = await db.department.findUnique({ where: { id: fresh.departmentId } });
    if (dept && dept.quotaBytes > 0n) {
      const agg = await db.user.aggregate({ where: { departmentId: dept.id }, _sum: { usedBytes: true } });
      const deptUsed = agg._sum.usedBytes ?? 0n;
      if (deptUsed + addBytes > dept.quotaBytes) {
        throw quotaError(
          `Departman kotası aşıldı (${dept.name}): ${formatBytes(deptUsed)} / ${formatBytes(dept.quotaBytes)} kullanımda.`
        );
      }
    }
  }
}

/** Sipariş sistemine hiç erişimi olmayanlar için: sidebar'da bile görünmemeli. */
export function canAccessOrders(user: User) {
  return user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders || user.canManageProduction;
}

/** Yeni sipariş oluşturabilir mi — pazarlama tarafı (+ admin). */
export function canCreateOrder(user: User) {
  return user.role === "ADMIN" || user.canCreateOrders;
}

/** Tüm siparişleri görüp durumunu değiştirebilir mi — muhasebe tarafı (+ admin). */
export function canManageOrders(user: User) {
  return user.role === "ADMIN" || user.canManageOrders;
}

/** Sipariş kalemlerinin stok durumunu (Var/Yok) işaretleyip "Üretimde" aşamasını yönetebilir mi (+ admin). */
export function canManageProduction(user: User) {
  return user.role === "ADMIN" || user.canManageProduction;
}

/** Kurum içi sohbet (beta) kanalı açabilir mi — spam'i önlemek için admin/departman yöneticisiyle sınırlı. Herkes mesaj yazabilir/DM atabilir, bu sadece KANAL AÇMA yetkisi. */
export function canManageChatChannels(user: User) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}

/**
 * Bir kanalı görebilir/mesaj yazabilir mi. Herkese açık (isPrivate=false) kanallarda
 * herkes erişebilir (beta'nın eski davranışı korunuyor). Gizli kanallarda ADMIN dahil
 * HERKES üyelik şart — admin istisnası bilerek yok: gizli kanal "kimin göremeyeceği"
 * kullanıcı tarafından belirleniyor, admin'in her şeyi görme kuralı burada uygulanmaz.
 */
export async function canAccessChatChannel(user: User, channelId: string): Promise<boolean> {
  const channel = await prisma.chatChannel.findUnique({ where: { id: channelId }, select: { isPrivate: true } });
  if (!channel) return false;
  if (!channel.isPrivate) return true;
  const membership = await prisma.chatChannelMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  return !!membership;
}

export function formatBytes(bytes: bigint | number) {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = n;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
