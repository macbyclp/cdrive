import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-token";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { ToolError, toolSearch } from "@/lib/claude-tools";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { user, tokenId } = await authenticateAgent(req);
    const limited = limitOr429("agent", tokenId, 120, 60_000);
    if (limited) return limited;
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json(await toolSearch(user, q));
  } catch (err) {
    if (err instanceof ToolError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
