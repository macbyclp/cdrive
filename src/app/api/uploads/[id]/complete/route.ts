import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { UploadError, completeSession, finishExtract } from "@/lib/upload-sessions";
import { extractZipToFolder } from "@/lib/zip-extract";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Tüm parçalar yüklendikten sonra çağrılır. Normal dosya: kalıcı depolamaya alınıp kaydedilir.
 * extract=true ile başlatılan .zip: içeriği hedef klasöre çıkarılır (arşivin kendisi saklanmaz).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await completeSession(user, id);
    if (result.kind === "file") {
      return NextResponse.json({ kind: "file", id: result.id, name: result.name, size: result.size, versioned: result.versioned });
    }
    try {
      const r = await extractZipToFolder({ user, zipPath: result.partPath, zipName: result.session.name, rootFolderId: result.session.folderId });
      return NextResponse.json({ kind: "zip", ...r });
    } finally {
      await finishExtract(id);
    }
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
