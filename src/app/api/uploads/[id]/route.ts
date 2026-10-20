import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { UploadError, abortSession, getSession } from "@/lib/upload-sessions";

export const dynamic = "force-dynamic";

/** Yükleme durumu: hangi parçalar alındı (kesinti sonrası devam için). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const s = await getSession(user, id);
    return NextResponse.json({ id: s.id, chunkSize: s.chunkSize, chunkCount: s.chunkCount, received: s.received });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}

/** Yüklemeyi iptal eder ve geçici dosyaları siler. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await abortSession(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
