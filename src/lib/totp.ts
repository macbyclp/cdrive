// RFC 6238 (TOTP) / RFC 4226 (HOTP) — sıfır bağımlılıkla, Node'un yerleşik
// `crypto` modülüyle. (otplib v13'ün API'sini kökten değiştirip plugin
// mimarisine geçmesi nedeniyle harici pakete güvenmek yerine burada elle
// yazıldı — bkz. archiver v8 ile yaşanan aynı türden sürpriz.)
import { createHmac, randomBytes } from "crypto";
import QRCode from "qrcode";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function totpAt(secret: string, epochSeconds: number): string {
  const counter = Math.floor(epochSeconds / PERIOD_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/** ±1 zaman adımı (30sn) tolerans ile doğrular — küçük saat kaymalarını tolere eder. */
export function verifyTotpToken(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const now = Math.floor(Date.now() / 1000);
  for (const drift of [0, -1, 1]) {
    if (totpAt(secret, now + drift * PERIOD_SECONDS) === token) return true;
  }
  return false;
}

export async function totpQrCodeDataUrl(email: string, secret: string) {
  const label = encodeURIComponent(`Cdrive:${email}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=Cdrive&digits=${DIGITS}&period=${PERIOD_SECONDS}`;
  return QRCode.toDataURL(otpauth);
}
