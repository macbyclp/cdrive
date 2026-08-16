import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ id: z.string().optional() });

// id verilirse tek bildirimi, verilmezse kullanıcının tüm bildirimlerini okundu yapar.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { id } = schema.parse(await req.json().catch(() => ({})));

    if (id) {
      await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
    } else {
      await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
