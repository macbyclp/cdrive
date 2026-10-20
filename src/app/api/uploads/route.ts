import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { UploadError, createSession } from "@/lib/upload-sessions";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().max(200).optional(),
  folderId: z.string().nullable().optional(),
  extract: z.boolean().optional(),
});

/**
 * Parçalı (büyük dosya) yüklemeyi başlatır. Yetki, politika, kota ve disk alanı BAŞTA denetlenir;
 * yanıttaki parça boyutuyla dosya PUT /api/uploads/{id}/chunks/{n} ile gönderilir, sonra POST …/complete.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("upload-init", user.id, 60, 60_000);
    if (limited) return limited;
    const body = schema.parse(await req.json());
    const s = await createSession(user, body);
    return NextResponse.json({ id: s.id, chunkSize: s.chunkSize, chunkCount: s.chunkCount }, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
