import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-token";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { ToolError, toolListFolder } from "@/lib/claude-tools";

export const dynamic = "force-dynamic";

/** Klasör içeriği (folderId yoksa kök): kullanıcının kendi yetkileriyle. */
export async function GET(req: Request) {
  try {
    const { user, tokenId } = await authenticateAgent(req);
    const limited = limitOr429("agent", tokenId, 120, 60_000);
    if (limited) return limited;
    const folderId = new URL(req.url).searchParams.get("folderId");
    return NextResponse.json(await toolListFolder(user, folderId || null));
  } catch (err) {
    if (err instanceof ToolError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
