import { NextResponse } from "next/server";
import { Readable } from "stream";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { contentDisposition } from "@/lib/download-names";
import { PackError, buildArchive, collectSelection } from "@/lib/zip-pack";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const schema = z.object({ fileIds: z.array(z.string()).optional(), folderIds: z.array(z.string()).optional() });

/**
 * Seçili dosya/klasörleri tek bir ZIP olarak indirir (akışlı). Tarayıcı bunu bir <form method="post"> ile çağırır
 * (payload alanında JSON) — böylece dosya JavaScript belleğine alınmadan doğrudan indirme olarak akar.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("zip-download", user.id, 20, 60_000);
    if (limited) return limited;
    let raw: unknown;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) raw = await req.json();
    else {
      const form = await req.formData();
      const p = form.get("payload");
      raw = typeof p === "string" ? JSON.parse(p) : {};
    }
    const { entries, label } = await collectSelection(user, schema.parse(raw));
    const { stream } = buildArchive(entries);
    await logAudit({ userId: user.id, action: "DOWNLOAD", targetType: "file", detail: `zip (${entries.length} dosya): ${label}` });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": contentDisposition("attachment", `${label}.zip`), "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof PackError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
