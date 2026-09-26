import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStorageWritable } from "@/lib/storage";

// Her istekte gerçekten kontrol edilsin (önbelleğe alınmış statik yanıt olmasın).
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

async function databaseOk(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Konteyner/yük dengeleyici sağlık kontrolü — oturum gerektirmez. Yalnız
 * evet/hayır bilgisi döner (hata mesajı, sürüm, yol gibi ayrıntı sızdırmaz).
 * Veritabanı ya da depolama kullanılamıyorsa 503.
 */
export async function GET() {
  const [database, storage] = await Promise.all([databaseOk(), isStorageWritable()]);
  const ok = database && storage;
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks: { database, storage } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
