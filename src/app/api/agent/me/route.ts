import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-token";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Anahtar kime ait? (MCP sunucusunun başlangıç denetimi) */
export async function GET(req: Request) {
  try {
    const { user, tokenId, agent } = await authenticateAgent(req);
    const limited = limitOr429("agent", tokenId, 120, 60_000);
    if (limited) return limited;
    return NextResponse.json({ name: user.name, email: user.email, role: user.role, agent });
  } catch (err) {
    return errorResponse(err);
  }
}
