import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { toolUserFromRequest } from "@/lib/claude";
import { ToolError, toolListFolder, toolProposeEdit, toolProposeNewFile, toolRead, toolSearch } from "@/lib/claude-tools";

// Yalnızca Claude sidecar'ı çağırır (Bearer = sohbet başına üretilen kısa ömürlü, kullanıcıya bağlı belirteç).
export const dynamic = "force-dynamic";

const schemas = {
  list_folder: z.object({ folderId: z.string().nullable().optional() }),
  search_files: z.object({ query: z.string().min(1).max(200) }),
  read_file: z.object({ fileId: z.string().min(1), offset: z.number().int().min(0).optional() }),
  propose_edit: z.object({ fileId: z.string().min(1), content: z.string(), summary: z.string().max(1000).optional() }),
  propose_new_file: z.object({
    name: z.string().min(1).max(200),
    content: z.string(),
    folderId: z.string().nullable().optional(),
    summary: z.string().max(1000).optional(),
  }),
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  try {
    const { user, runId } = await toolUserFromRequest(req);
    const limited = limitOr429("claude-tool", `${user.id}:${runId}`, 60, 60_000);
    if (limited) return limited;
    const { tool } = await params;
    if (!(tool in schemas)) return NextResponse.json({ error: "Bilinmeyen araç" }, { status: 404 });
    const body = await req.json().catch(() => ({}));

    switch (tool as keyof typeof schemas) {
      case "list_folder": {
        const a = schemas.list_folder.parse(body);
        return NextResponse.json(await toolListFolder(user, a.folderId ?? null));
      }
      case "search_files": {
        const a = schemas.search_files.parse(body);
        return NextResponse.json(await toolSearch(user, a.query));
      }
      case "read_file": {
        const a = schemas.read_file.parse(body);
        return NextResponse.json(await toolRead(user, a.fileId, a.offset ?? 0));
      }
      case "propose_edit": {
        const a = schemas.propose_edit.parse(body);
        return NextResponse.json(await toolProposeEdit(user, a));
      }
      case "propose_new_file": {
        const a = schemas.propose_new_file.parse(body);
        return NextResponse.json(await toolProposeNewFile(user, a));
      }
    }
  } catch (err) {
    if (err instanceof ToolError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
