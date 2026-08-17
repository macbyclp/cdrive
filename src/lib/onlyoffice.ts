import { SignJWT, jwtVerify } from "jose";
import { officeDocType, extOf } from "@/lib/format";

export { officeDocType, extOf };

/**
 * OnlyOffice Document Server entegrasyonu için yardımcılar.
 *
 * Document Server, Cdrive'dan AYRI bir sunucuda (kendi VPS'inizde, Docker ile)
 * çalışır ve dosya içeriğini/kaydetme sonucunu HTTP üzerinden Cdrive'a bağlanarak
 * alır — bu yüzden normal oturum çerezi ile kimlik doğrulayamaz. Bunun yerine
 * her düzenleme oturumu için kısa ömürlü, dosyaya özel bir "office token" imzalanır
 * (bkz. signOfficeContentToken); Document Server bu token'ı content/callback
 * uç noktalarına query param olarak taşır.
 *
 * Ayrıca Document Server'ın kendisi de (ONLYOFFICE_JWT_SECRET tanımlıysa) hem
 * bizim gönderdiğimiz config'i hem de bize geri gönderdiği callback isteğini
 * JWT ile imzalar — bu ayrı bir imza/doğrulama katmanıdır (signOnlyOfficeJwt /
 * verifyOnlyOfficeJwt).
 */

const officeTokenSecret = new TextEncoder().encode(
  process.env.OFFICE_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me"
);

export function isOnlyOfficeConfigured() {
  return !!process.env.ONLYOFFICE_URL;
}

/** Document Server → Cdrive isteklerinde (content/callback) kullanılan kısa ömürlü token. */
export async function signOfficeContentToken(payload: { fileId: string; versionId: string; userId: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(officeTokenSecret);
}

export async function verifyOfficeContentToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, officeTokenSecret);
    return payload as { fileId: string; versionId: string; userId: string };
  } catch {
    return null;
  }
}

/** Document Server'ın kendi JWT imzası — sadece ONLYOFFICE_JWT_SECRET tanımlıysa kullanılır. */
export async function signOnlyOfficeJwt(payload: Record<string, unknown>) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) return null;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secret));
}

/**
 * Document Server'dan gelen callback isteğinin JWT imzasını doğrular.
 * ONLYOFFICE_JWT_SECRET tanımlı değilse doğrulama atlanır (geliştirme ortamı) —
 * production'da bu değişkenin MUTLAKA ayarlanması önerilir (README'ye bakın).
 */
export async function verifyOnlyOfficeRequest(authHeader: string | null) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) return true; // JWT kapalı — güvenilmez ama geliştirme için kabul edilebilir
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    await jwtVerify(authHeader.slice(7), new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}
