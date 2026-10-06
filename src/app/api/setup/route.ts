import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp, limitOr429 } from "@/lib/api-helpers";
import { assertPasswordPolicy } from "@/lib/password-policy";

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

class SetupDoneError extends Error {}

export async function POST(req: Request) {
  try {
    const limited = limitOr429("setup", clientIp(req) ?? "unknown", 10, 60_000);
    if (limited) return limited;
    if ((await prisma.user.count()) > 0) {
      return NextResponse.json({ error: "Kurulum zaten tamamlanmış. Lütfen giriş yapın." }, { status: 409 });
    }
    const body = schema.parse(await req.json());
    assertPasswordPolicy(body.password, { email: body.email, name: body.name });
    const passwordHash = await hashPassword(body.password);

    // "Hiç kullanıcı yok" kontrolü ile oluşturma ARASINDA eşzamanlı ikinci bir istek de geçebilirdi
    // (iki yönetici hesabı). MySQL adlandırılmış kilidi (bağlantıya bağlıdır, bu yüzden aynı transaction
    // bağlantısında alınıp bırakılır) kontrol+oluşturmayı serileştirir.
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<{ got: number | bigint | null }[]>`SELECT GET_LOCK('cdrive_setup', 10) AS got`;
        if (Number(lock?.got) !== 1) throw new SetupDoneError();
        try {
          if ((await tx.user.count()) > 0) throw new SetupDoneError();
          return await tx.user.create({
            data: { name: body.name, email: body.email.toLowerCase(), passwordHash, role: "ADMIN" },
          });
        } finally {
          await tx.$queryRaw`SELECT RELEASE_LOCK('cdrive_setup')`;
        }
      });
    } catch (e) {
      if (e instanceof SetupDoneError) {
        return NextResponse.json({ error: "Kurulum zaten tamamlanmış. Lütfen giriş yapın." }, { status: 409 });
      }
      throw e;
    }

    // İlk kurulum bootstrap'ı — 2FA zorunluluğu olsa bile ilk admin kilitlenmesin diye burada uygulanmaz.
    await createSession(
      { userId: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: false, twoFactorRequired: false },
      { ip: clientIp(req), userAgent: req.headers.get("user-agent") }
    );
    await logAudit({ userId: user.id, action: "USER_CREATE", detail: "İlk admin hesabı oluşturuldu", ip: clientIp(req) });
    return NextResponse.json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
