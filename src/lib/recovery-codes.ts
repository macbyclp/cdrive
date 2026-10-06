// 2FA kurtarma kodları: authenticator kaybolursa girişe ve 2FA'yı kapatmaya izin verir.
// Kod 10 karakter (50 bit), "xxxxx-xxxxx" biçiminde gösterilir; DB'de yalnız sha256 hash'i durur
// (yüksek entropili olduğu için yavaş hash gerekmez). Her kod tek kullanımlıktır.
import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

// Karışan karakterler (0/o, 1/l/i) yok.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const RECOVERY_CODE_COUNT = 10;
const LENGTH = 10;

export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Küçük harfe çevirir, tire/boşlukları atar — kullanıcı "ABCDE FGHJK" yazsa da eşleşsin. */
export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 6 haneli TOTP kodundan ayırt etmek için: normalize edilmiş hali 10 karakter ve harf içerir. */
export function looksLikeRecoveryCode(input: string): boolean {
  const n = normalizeRecoveryCode(input);
  return n.length === LENGTH && /[a-z]/.test(n);
}

export function hashRecoveryCode(input: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(input)).digest("hex");
}

/** Kullanıcının tüm eski kodlarını siler, yenilerini üretir ve HAM kodları döner (bir kez gösterilir). */
export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
    }),
  ]);
  return codes;
}

/** Kodu atomik olarak tüketir (koşullu UPDATE): aynı kodla eşzamanlı iki istekten yalnız biri geçer. */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  if (!looksLikeRecoveryCode(input)) return false;
  const res = await prisma.twoFactorRecoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(input), usedAt: null },
    data: { usedAt: new Date() },
  });
  return res.count === 1;
}

export async function countRemainingRecoveryCodes(userId: string): Promise<number> {
  return prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
}

export async function deleteRecoveryCodes(userId: string) {
  await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } });
}
