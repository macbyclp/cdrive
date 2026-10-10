import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-token";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { AgentUploadError, MAX_AGENT_UPLOAD_BYTES, agentUpload } from "@/lib/agent-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Yapay zekâ aracı kullanıcının sürücüsüne dosya yükler (multipart: file, folderId?, name?).
 * folderId yoksa kullanıcının ana (kök) klasörü. Aynı adlı dosya varsa yeni SÜRÜM olur (geri alınabilir).
 */
export async function POST(req: Request) {
  try {
    const { user, tokenId, agent } = await authenticateAgent(req);
    const limited = limitOr429("agent-upload", tokenId, 60, 60_000);
    if (limited) return limited;
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_AGENT_UPLOAD_BYTES + 1_000_000) return NextResponse.json({ error: "Dosya çok büyük" }, { status: 413 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file alanı gerekli (multipart)" }, { status: 400 });
    const nameRaw = form.get("name");
    const folderRaw = form.get("folderId");
    const result = await agentUpload({
      user,
      agent,
      name: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw : file.name,
      mimeType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
      folderId: typeof folderRaw === "string" && folderRaw ? folderRaw : null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AgentUploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
