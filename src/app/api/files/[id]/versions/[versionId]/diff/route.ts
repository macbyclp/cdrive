import { NextResponse } from "next/server";
import { diffLines } from "diff";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { readFile } from "@/lib/storage";
import { errorResponse } from "@/lib/api-helpers";

/** İkili (binary) içerik sezgisi: ilk 8000 baytta NUL veya çok sayıda kontrol karakteri varsa metin değildir. */
function looksBinary(buf: Buffer) {
  const sample = buf.subarray(0, 8000);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
  }
  return sample.length > 0 && suspicious / sample.length > 0.1;
}

/** İki dosya versiyonu arasındaki farkı döner — metin ise satır satır diff, ikiliyse sadece boyut karşılaştırması. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const user = await requireUser();
    const ok = await canAccessFile(user, id, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const against = searchParams.get("against");
    if (!against) return NextResponse.json({ error: "\"against\" versiyon id'si gerekli" }, { status: 400 });

    const [a, b] = await Promise.all([
      prisma.fileVersion.findUnique({ where: { id: against } }),
      prisma.fileVersion.findUnique({ where: { id: versionId } }),
    ]);
    if (!a || !b || a.fileId !== id || b.fileId !== id) {
      return NextResponse.json({ error: "Versiyon bulunamadı" }, { status: 404 });
    }

    const [bufA, bufB] = await Promise.all([readFile(a.storageKey), readFile(b.storageKey)]);

    if (looksBinary(bufA) || looksBinary(bufB)) {
      return NextResponse.json({
        binary: true,
        sizeFrom: a.size.toString(),
        sizeTo: b.size.toString(),
        versionNoFrom: a.versionNo,
        versionNoTo: b.versionNo,
      });
    }

    const parts = diffLines(bufA.toString("utf-8"), bufB.toString("utf-8"));
    return NextResponse.json({
      binary: false,
      versionNoFrom: a.versionNo,
      versionNoTo: b.versionNo,
      parts: parts.map((p) => ({ added: !!p.added, removed: !!p.removed, value: p.value })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
