import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { department: true },
  });
  if (!user || !user.active) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department?.name ?? null,
      usedBytes: user.usedBytes.toString(),
      quotaBytes: user.quotaBytes.toString(),
      twoFactorEnabled: user.twoFactorEnabled,
    },
  });
}
