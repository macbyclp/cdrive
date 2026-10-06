import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUnrestrictedUser, hashPassword } from "@/lib/auth";
import { canAccessFolder } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";
import { maskToken } from "@/lib/share";
import { uploadRequestStatus } from "@/lib/upload-request";

const MB = 1024 * 1024;

const schema = z.object({
  folderId: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  message: z.string().trim().max(500).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxFiles: z.number().int().min(1).max(200).default(20),
  maxFileMB: z.number().int().min(1).max(2048).default(50),
  password: z.string().min(4).max(100).optional(),
});

/** Bir klasör için hesapsız yükleme bağlantısı oluşturur (klasörde EDIT yetkisi gerekir). */
export async function POST(req: Request) {
  try {
    const user = await requireUnrestrictedUser();
    const limited = limitOr429("upload-request-create", user.id, 20, 60_000);
    if (limited) return limited;
    const body = schema.parse(await req.json());

    const folder = await prisma.folder.findUnique({ where: { id: body.folderId } });
    if (!folder || folder.deletedAt) return NextResponse.json({ error: "Klasör bulunamadı" }, { status: 404 });
    if (!(await canAccessFolder(user, body.folderId, "EDIT"))) {
      return NextResponse.json({ error: "Bu klasör için yükleme isteği oluşturma yetkiniz yok" }, { status: 403 });
    }

    const token = randomBytes(24).toString("base64url");
    const created = await prisma.uploadRequest.create({
      data: {
        token,
        folderId: body.folderId,
        createdById: user.id,
        title: body.title,
        message: body.message || null,
        passwordHash: body.password ? await hashPassword(body.password, 10) : null,
        expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 3600_000),
        maxFiles: body.maxFiles,
        maxFileBytes: BigInt(body.maxFileMB) * BigInt(MB),
      },
    });
    await logAudit({
      userId: user.id,
      action: "SHARE_CREATE",
      targetType: "folder",
      targetId: body.folderId,
      detail: `dosya isteği: ${body.title} (${maskToken(token)})`,
    });
    return NextResponse.json(serialize(created));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Bir klasörün yükleme istekleri (yönetici hepsini, diğerleri yalnız kendi oluşturduklarını görür). */
export async function GET(req: Request) {
  try {
    const user = await requireUnrestrictedUser();
    const folderId = new URL(req.url).searchParams.get("folderId");
    if (!folderId) return NextResponse.json({ error: "folderId gerekli" }, { status: 400 });
    if (!(await canAccessFolder(user, folderId, "EDIT"))) {
      return NextResponse.json({ error: "Yetkiniz yok" }, { status: 403 });
    }
    const rows = await prisma.uploadRequest.findMany({
      where: { folderId, revoked: false, ...(user.role === "ADMIN" ? {} : { createdById: user.id }) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const now = new Date();
    return NextResponse.json(
      rows.map((r) => {
        const st = uploadRequestStatus(r, now);
        return { ...serialize(r), status: st.ok ? "active" : st.reason };
      })
    );
  } catch (err) {
    return errorResponse(err);
  }
}

function serialize(r: { passwordHash: string | null; maxFileBytes: bigint; [k: string]: unknown }) {
  const { passwordHash, maxFileBytes, ...rest } = r;
  return { ...rest, hasPassword: !!passwordHash, maxFileBytes: maxFileBytes.toString() };
}
