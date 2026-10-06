// Veritabanında durağan halde (at rest) tutulan sırların (2FA anahtarı, SMTP parolası) şifrelenmesi.
//
// AES-256-GCM. Anahtar, SESSION_SECRET'tan DEĞİL ayrı bir DATA_ENCRYPTION_KEY'den türetilir: oturum
// anahtarını döndürmek (olay müdahalesinde olağan adım) tüm 2FA kayıtlarını okunmaz hale getirmesin.
// Anahtar tanımlı değilse davranış eskisi gibidir (düz metin); tanımlıysa yeni yazımlar şifreli olur ve
// eski düz metin kayıtlar okunmaya devam eder (kullanıldıkça şifreliye yükseltilir) — kesintisiz geçiş.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  if (raw.length < 32) throw new Error("DATA_ENCRYPTION_KEY en az 32 karakter olmalıdır (ör. `openssl rand -hex 32`).");
  return createHash("sha256").update(`cdrive:data-encryption:v1:${raw}`).digest();
}

export function isSealed(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export function encryptionEnabled(): boolean {
  return key() !== null;
}

/** Anahtar tanımlıysa şifreler; değilse değeri olduğu gibi döner. */
export function sealSecret(plain: string): string {
  const k = key();
  if (!k || isSealed(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

/** Şifreli değeri çözer; düz metin (eski kayıt) olduğu gibi döner. Anahtar yok/yanlışsa hata fırlatır. */
export function openSecret(stored: string): string {
  if (!isSealed(stored)) return stored;
  const k = key();
  if (!k) throw new Error("Şifreli sır okunamıyor: DATA_ENCRYPTION_KEY tanımlı değil.");
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  if (!iv || !tag || !ct) throw new Error("Şifreli sır biçimi bozuk.");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
