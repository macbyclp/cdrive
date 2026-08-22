import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * VDS'teki günlük yedekleme cron'unun (bkz. ~/cdrive-deploy/backup-all.sh) çıktısını
 * SADECE OKUMA amaçlı listeler — bilerek burada bir "restore" eylemi YOK. Web'den tek
 * tıkla production veritabanının üzerine yazan bir buton, blast radius'u (yanlış tık =
 * geri dönüşsüz veri kaybı) çok yüksek bir özellik; geri yükleme bilerek elle bir SSH
 * işlemi olarak kalıyor (bkz. backup-all.sh'ın kendisi).
 *
 * İki tür yedek listelenir (2026-08-22'de eklendi): `cdrive_*.sql.gz` veritabanı dump'ı
 * ve `storage_*.tar.gz` yüklenen dosyaların arşivi. Önceden sadece DB yedekleniyordu —
 * yani disk kaybında veritabanı geri gelse bile dosyalar gitmiş olacaktı. Bir yedek
 * "tam" sayılabilmesi için aynı tarihte HER İKİ dosyanın da bulunması gerekir; UI bunu
 * `kind` alanıyla ayırt edebilsin diye tür bilgisi ayrıca dönülüyor.
 *
 * BACKUP_DIR env değişkeni (docker-compose'da salt-okunur mount) yoksa özellik sessizce
 * "yapılandırılmamış" döner — yerel geliştirmede hiç kırılmaz.
 */
export async function GET() {
  try {
    await requireRole("ADMIN");
    const dir = process.env.BACKUP_DIR;
    if (!dir) return NextResponse.json({ configured: false, backups: [] });

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return NextResponse.json({ configured: true, backups: [], error: "Yedek klasörü okunamadı" });
    }

    const gzFiles = entries.filter((f) => f.endsWith(".sql.gz") || f.endsWith(".tar.gz"));
    const backups = await Promise.all(
      gzFiles.map(async (name) => {
        const s = await stat(path.join(dir, name));
        return {
          name,
          kind: name.endsWith(".sql.gz") ? ("database" as const) : ("storage" as const),
          sizeBytes: s.size,
          modifiedAt: s.mtime.toISOString(),
        };
      })
    );
    backups.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    // Dosya yedeklemesi 2026-08-22'de eklendi; hiç `storage_*.tar.gz` yoksa cron
    // hâlâ eski sadece-DB scriptini çalıştırıyor olabilir — UI bunu uyarı olarak
    // gösterebilsin diye ayrıca bildiriyoruz (sessizce eksik yedekten iyidir).
    const hasStorageBackup = backups.some((b) => b.kind === "storage");

    return NextResponse.json({ configured: true, backups, hasStorageBackup });
  } catch (err) {
    return errorResponse(err);
  }
}
