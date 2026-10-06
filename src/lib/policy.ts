import { prisma } from "@/lib/prisma";
import { formatBytes } from "@/lib/access";

class PolicyError extends Error {
  status = 400;
}

/** Admin panelinden ayarlanan dosya türü/boyutu politikalarını kontrol eder; ihlalde fırlatır. */
export async function assertFilePolicy(fileName: string, size: bigint) {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings) return;

  if (settings.maxFileSizeBytes && size > settings.maxFileSizeBytes) {
    throw new PolicyError(
      `Dosya boyutu sınırı aşıldı: ${formatBytes(size)} > izin verilen ${formatBytes(settings.maxFileSizeBytes)}.`
    );
  }

  if (settings.blockedExtensions) {
    const blocked = settings.blockedExtensions
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const ext = fileName.includes(".") ? `.${fileName.split(".").pop()!.toLowerCase()}` : "";
    if (ext && blocked.includes(ext)) {
      throw new PolicyError(`"${ext}" uzantılı dosyalar yönetici tarafından engellendi.`);
    }
  }
}

// Politika ayarlı olmasa bile tek bir yüklemenin diske yazabileceği en büyük boyut (disk/süre koruması).
const DEFAULT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Bir yüklemenin en çok kaç bayt olabileceği: yönetici politikası ile UPLOAD_MAX_BYTES'ın küçüğü. */
export async function maxUploadBytes(): Promise<number> {
  const env = Number(process.env.UPLOAD_MAX_BYTES);
  const hard = Number.isFinite(env) && env > 0 ? env : DEFAULT_UPLOAD_MAX_BYTES;
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const policy = settings?.maxFileSizeBytes ? Number(settings.maxFileSizeBytes) : null;
  return policy && policy > 0 ? Math.min(policy, hard) : hard;
}
