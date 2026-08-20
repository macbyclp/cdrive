import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * VDS'teki günlük yedekleme cron'unun (bkz. ~/cdrive-deploy/backup-db.sh, 2026-08-20'de
 * kurulan otomatik DB yedekleme) çıktısını SADECE OKUMA amaçlı listeler — bilerek burada
 * bir "restore" eylemi YOK. Web'den tek tıkla production veritabanının üzerine yazan bir
 * buton, blast radius'u (yanlış tık = geri dönüşsüz veri kaybı) çok yüksek bir özellik;
 * geri yükleme bilerek elle bir SSH işlemi olarak kalıyor (bkz. backup-db.sh'ın kendisi).
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

    const gzFiles = entries.filter((f) => f.endsWith(".sql.gz"));
    const backups = await Promise.all(
      gzFiles.map(async (name) => {
        const s = await stat(path.join(dir, name));
        return { name, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() };
      })
    );
    backups.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    return NextResponse.json({ configured: true, backups });
  } catch (err) {
    return errorResponse(err);
  }
}
