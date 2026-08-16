import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

// İlk kurulum: sistemde hiç kullanıcı yoksa ilk admin hesabını oluşturur.
export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ needsSetup: count === 0 });
}

export async function POST(req: Request) {
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      return NextResponse.json(
        { error: "Kurulum zaten tamamlanmış. Lütfen giriş yapın." },
        { status: 409 }
      );
    }
    const body = schema.parse(await req.json());
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email.toLowerCase(), passwordHash, role: "ADMIN" },
    });
    await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role },
      { ip: clientIp(req), userAgent: req.headers.get("user-agent") }
    );
    await logAudit({ userId: user.id, action: "USER_CREATE", detail: "İlk admin hesabı oluşturuldu", ip: clientIp(req) });
    return NextResponse.json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
