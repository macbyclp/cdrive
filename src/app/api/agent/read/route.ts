import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-token";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { ToolError, toolRead } from "@/lib/claude-tools";

export const dynamic = "force-dynamic";

/** Dosya içeriğini metin olarak okur (metin/PDF/Word/Excel/PowerPoint); parça parça (offset). */
export async function GET(req: Request) {
  try {
    const { user, tokenId } = await authenticateAgent(req);
    const limited = limitOr429("agent", tokenId, 120, 60_000);
    if (limited) return limited;
    const sp = new URL(req.url).searchParams;
    const fileId = sp.get("fileId");
    if (!fileId) return NextResponse.json({ error: "fileId gerekli" }, { status: 400 });
    const offset = Number(sp.get("offset") ?? 0);
    return NextResponse.json(await toolRead(user, fileId, Number.isFinite(offset) && offset > 0 ? offset : 0));
  } catch (err) {
    if (err instanceof ToolError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
