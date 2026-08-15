import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, hashPassword } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  fileId: z.string(),
  expiresInHours: z.number().min(1).max(24 * 30).optional(),
  maxDownloads: z.number().min(1).optional(),
  password: z.string().min(4).max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const ok = await canAccessFile(user, body.fileId, "VIEW");
    if (!ok) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });

    const token = randomBytes(24).toString("base64url");
    const link = await prisma.shareLink.create({
      data: {
        token,
        fileId: body.fileId,
        createdById: user.id,
        expiresAt: body.expiresInHours
          ? new Date(Date.now() + body.expiresInHours * 3600_000)
          : null,
        maxDownloads: body.maxDownloads ?? null,
        passwordHash: body.password ? await hashPassword(body.password) : null,
      },
    });
    await logAudit({ userId: user.id, action: "SHARE_CREATE", targetType: "file", targetId: body.fileId, detail: token });
    return NextResponse.json({ ...link, passwordHash: undefined, hasPassword: !!link.passwordHash });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");
    if (!fileId) return NextResponse.json({ error: "fileId gerekli" }, { status: 400 });
    const ok = await canAccessFile(user, fileId, "VIEW");
    if (!ok) return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    const links = await prisma.shareLink.findMany({ where: { fileId }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(
      links.map((l) => ({ ...l, passwordHash: undefined, hasPassword: !!l.passwordHash }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}
