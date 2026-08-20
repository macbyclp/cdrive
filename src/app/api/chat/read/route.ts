import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";
import { channelScopeKey, dmScopeKey } from "@/lib/chat";

const schema = z
  .object({ channelId: z.string().optional(), dmUserId: z.string().optional() })
  .refine((d) => !!d.channelId !== !!d.dmUserId, { message: "channelId veya dmUserId'den tam olarak biri verilmeli" });

/** Sohbet penceresi açıldığında çağrılır — o kanalı/DM'i "okundu" işaretler, sidebar'daki rozeti kapatır. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const scopeKey = body.channelId ? channelScopeKey(body.channelId) : dmScopeKey(body.dmUserId!);

    await prisma.chatReadState.upsert({
      where: { userId_scopeKey: { userId: user.id, scopeKey } },
      update: { lastReadAt: new Date() },
      create: { userId: user.id, scopeKey, lastReadAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
