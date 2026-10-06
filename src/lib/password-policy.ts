// Parola politikası (saf, test edilebilir). Uzunluk dışında kuralları bilerek az tutar: karmaşıklık
// zorlamaları ("1 büyük harf + 1 rakam") zayıf parolaları (Password1) önlemez, kullanıcıyı yorar.
// Asıl riskler: çok yaygın parolalar, e-postadan türeyen parolalar ve bcrypt'in 72 baytı aşan kısmı SESSİZCE
// yok sayması (uzun parolanın sonu hiç doğrulanmaz).

const MIN_LENGTH = 8;
const MAX_BYTES = 72;

// En sık kullanılan parolalar (TR + genel). Tam liste değil; bariz olanları yakalar.
const COMMON = new Set(
  `12345678 123456789 1234567890 11111111 00000000 87654321 987654321 12341234 123123123 1q2w3e4r 1q2w3e4r5t
   password password1 password12 password123 passw0rd p@ssw0rd p@ssword qwerty123 qwertyui qwertyuiop qwerty12
   abc12345 abcd1234 abcdefgh iloveyou admin123 administrator letmein1 welcome1 welcome123 monkey123 dragon123
   sifre123 sifre1234 parola123 parola1234 sifresifre turkiye1 turkiye123 istanbul34 ankara06 izmir3535
   galatasaray fenerbahce besiktas trabzonspor galatasaray1 fenerbahce1 besiktas1 cdrive123 cdrive1234`
    .split(/\s+/)
    .filter(Boolean)
);

export type PasswordContext = { email?: string | null; name?: string | null };

/** Parola kabul edilemezse kullanıcıya gösterilecek Türkçe nedeni, uygunsa null döner. */
export function passwordProblem(password: string, ctx: PasswordContext = {}): string | null {
  if (password.length < MIN_LENGTH) return `Şifre en az ${MIN_LENGTH} karakter olmalı`;
  if (Buffer.byteLength(password, "utf8") > MAX_BYTES) return `Şifre en fazla ${MAX_BYTES} bayt (yaklaşık 70 karakter) olabilir`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "Bu şifre çok yaygın; daha tahmin edilmesi zor bir şifre seçin";
  if (new Set(lower).size === 1) return "Şifre tek bir karakterin tekrarı olamaz";
  const email = ctx.email?.toLowerCase().trim();
  if (email) {
    const local = email.split("@")[0];
    if (lower === email || (local.length >= 4 && lower === local)) return "Şifre e-posta adresinizle aynı olamaz";
  }
  const name = ctx.name?.toLowerCase().replace(/\s+/g, "");
  if (name && name.length >= 4 && lower === name) return "Şifre adınızla aynı olamaz";
  return null;
}

/** Politikayı ihlal ederse 400 durumlu hata fırlatır (errorResponse bunu kullanıcıya iletir). */
export function assertPasswordPolicy(password: string, ctx: PasswordContext = {}) {
  const problem = passwordProblem(password, ctx);
  if (problem) throw Object.assign(new Error(problem), { status: 400 });
}
