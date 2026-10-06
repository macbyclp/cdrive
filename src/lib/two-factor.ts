// İkinci faktör doğrulaması — TEK KAYNAK: giriş (2fa/verify), 2FA'yı kapatma ve kurtarma
// kodlarını yenileme aynı kuralı kullanır (TOTP tekrar kullanım koruması + kurtarma kodu).
import { prisma } from "@/lib/prisma";
import { matchTotpStep } from "@/lib/totp";
import { consumeRecoveryCode, looksLikeRecoveryCode } from "@/lib/recovery-codes";

export type SecondFactorResult =
  | { ok: true; method: "totp" | "recovery" }
  | { ok: false; reason: "invalid" | "replay" };

export async function verifySecondFactor(
  user: { id: string; twoFactorSecret: string | null },
  code: string
): Promise<SecondFactorResult> {
  const trimmed = code.trim();
  if (looksLikeRecoveryCode(trimmed)) {
    return (await consumeRecoveryCode(user.id, trimmed)) ? { ok: true, method: "recovery" } : { ok: false, reason: "invalid" };
  }
  if (!user.twoFactorSecret) return { ok: false, reason: "invalid" };
  const step = matchTotpStep(trimmed, user.twoFactorSecret);
  if (step === null) return { ok: false, reason: "invalid" };
  // Bir kod (ve daha eski adımlar) yalnız BİR kez kabul edilir; koşullu UPDATE atomiktir.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
    data: { twoFactorLastStep: step },
  });
  return claimed.count === 0 ? { ok: false, reason: "replay" } : { ok: true, method: "totp" };
}
