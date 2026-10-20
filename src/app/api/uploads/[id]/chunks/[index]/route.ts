import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { UploadError, writeChunk } from "@/lib/upload-sessions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Bir parçayı (ham bayt gövde) diske yazar. Aynı parça yeniden gönderilebilir. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const user = await requireUser();
    const limited = limitOr429("upload-chunk", user.id, 1200, 60_000);
    if (limited) return limited;
    const { id, index } = await params;
    const s = await writeChunk(user, id, Number(index), req.body);
    return NextResponse.json({ received: s.received.length, chunkCount: s.chunkCount });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
