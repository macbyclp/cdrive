import { prisma } from "@/lib/prisma";

/** Footer'da ve e-posta şablonlarında gösterilen kurum/telif adı — admin panelinden değiştirilebilir. */
export async function getOrgName(): Promise<string> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 }, select: { orgName: true } });
  return settings?.orgName ?? "MACBYMAC";
}
