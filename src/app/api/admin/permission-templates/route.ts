import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

/**
 * Hazır izin şablonları: bir izin seviyesi + üye listesi (kullanıcı ve/veya grup).
 * Liste herkese açık (paylaşım diyaloğunda "şablon uygula" seçeneği için) ama
 * oluşturma/silme sadece admin'e — şablonlar erişim genişletme gücüne sahip.
 */
export async function GET() {
  try {
    await requireUser();
    const templates = await prisma.permissionTemplate.findMany({
      orderBy: { name: "asc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            group: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(
      templates.map((t) => ({
        id: t.id,
        name: t.name,
        permission: t.permission,
        members: t.members.map((m) => ({
          user: m.user,
          group: m.group,
        })),
      }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  permission: z.enum(["VIEW", "EDIT"]),
  userEmails: z.array(z.string().email()).default([]),
  groupIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = schema.parse(await req.json());

    const users = body.userEmails.length
      ? await prisma.user.findMany({ where: { email: { in: body.userEmails.map((e) => e.toLowerCase()) } } })
      : [];

    const template = await prisma.permissionTemplate.create({
      data: {
        name: body.name,
        permission: body.permission,
        members: {
          create: [
            ...users.map((u) => ({ userId: u.id })),
            ...body.groupIds.map((groupId) => ({ groupId })),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            group: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json({
      id: template.id,
      name: template.name,
      permission: template.permission,
      members: template.members.map((m) => ({ user: m.user, group: m.group })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
