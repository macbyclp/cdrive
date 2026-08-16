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
