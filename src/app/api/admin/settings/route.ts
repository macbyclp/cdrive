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

export async function GET() {
  try {
    await requireRole("ADMIN");
    const settings = await getOrCreateSettings();
    return NextResponse.json({
      ...settings,
      maxFileSizeBytes: settings.maxFileSizeBytes?.toString() ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  trashRetentionDays: z.number().int().positive().nullable().optional(),
  versionRetentionDays: z.number().int().positive().nullable().optional(),
  maxFileSizeBytes: z.number().positive().nullable().optional(),
  blockedExtensions: z.string().nullable().optional(),
  uiSkin: z.enum(["modern", "archive"]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = schema.parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    if (body.maxFileSizeBytes !== undefined) {
      data.maxFileSizeBytes = body.maxFileSizeBytes === null ? null : BigInt(body.maxFileSizeBytes);
    }

    await getOrCreateSettings();
    const settings = await prisma.systemSettings.update({ where: { id: 1 }, data });
    await logAudit({ userId: admin.id, action: "SETTINGS_UPDATE" });
    return NextResponse.json({ ...settings, maxFileSizeBytes: settings.maxFileSizeBytes?.toString() ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
