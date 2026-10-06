// İkinci faktör doğrulaması — TEK KAYNAK: giriş (2fa/verify), 2FA'yı kapatma ve kurtarma
// kodlarını yenileme aynı kuralı kullanır (TOTP tekrar kullanım koruması + kurtarma kodu).
import { prisma } from "@/lib/prisma";
import { matchTotpStep } from "@/lib/totp";
import { consumeRecoveryCode, looksLikeRecoveryCode } from "@/lib/recovery-codes";
import { encryptionEnabled, isSealed, openSecret, sealSecret } from "@/lib/secret-box";

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
  const step = matchTotpStep(trimmed, openSecret(user.twoFactorSecret));
  if (step === null) return { ok: false, reason: "invalid" };
  // Bir kod (ve daha eski adımlar) yalnız BİR kez kabul edilir; koşullu UPDATE atomiktir.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
    data: { twoFactorLastStep: step },
  });
  if (claimed.count === 0) return { ok: false, reason: "replay" };
  // Eski düz metin anahtarı, şifreleme açıldıktan sonraki ilk başarılı kullanımda şifreliye yükselt.
  if (encryptionEnabled() && !isSealed(user.twoFactorSecret)) {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: sealSecret(user.twoFactorSecret) } });
  }
  return { ok: true, method: "totp" };
}
