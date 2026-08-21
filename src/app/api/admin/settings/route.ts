import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

async function getOrCreateSettings() {
  return prisma.systemSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

/** smtpPass API yanıtlarında ASLA geri dönmez — sadece "ayarlı mı" bilgisi (smtpPasswordSet). */
function serialize(settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  const { smtpPass, ...rest } = settings;
  return {
    ...rest,
    maxFileSizeBytes: settings.maxFileSizeBytes?.toString() ?? null,
    smtpPasswordSet: !!smtpPass,
  };
}

export async function GET() {
  try {
    await requireRole("ADMIN");
    const settings = await getOrCreateSettings();
    return NextResponse.json(serialize(settings));
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  trashRetentionDays: z.number().int().positive().nullable().optional(),
  versionRetentionDays: z.number().int().positive().nullable().optional(),
  maxFileSizeBytes: z.number().positive().nullable().optional(),
  blockedExtensions: z.string().nullable().optional(),
  uiSkin: z.enum(["modern", "archive", "panel"]).optional(),
  require2faForAdmins: z.boolean().optional(),
  orgName: z.string().trim().min(1).max(100).optional(),
  smtpHost: z.string().trim().max(200).nullable().optional(),
  smtpPort: z.number().int().positive().max(65535).nullable().optional(),
  smtpUser: z.string().trim().max(200).nullable().optional(),
  // Boş string gönderilirse "şifreyi temizle" anlamına gelir; alan hiç gönderilmezse
  // (undefined) mevcut şifre AYNEN korunur — kullanıcı diğer alanları güncellerken
  // şifreyi tekrar yazmak zorunda kalmasın diye.
  smtpPass: z.string().max(500).nullable().optional(),
  mailFrom: z.string().trim().email().nullable().optional().or(z.literal("")),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = schema.parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.maxFileSizeBytes !== undefined) {
      data.maxFileSizeBytes = body.maxFileSizeBytes === null ? null : BigInt(body.maxFileSizeBytes);
    }
    if (body.mailFrom === "") data.mailFrom = null;
    if (body.smtpPass === "") data.smtpPass = null;

    await getOrCreateSettings();
    const settings = await prisma.systemSettings.update({ where: { id: 1 }, data });
    await logAudit({ userId: admin.id, action: "SETTINGS_UPDATE" });
    return NextResponse.json(serialize(settings));
  } catch (err) {
    return errorResponse(err);
  }
}
