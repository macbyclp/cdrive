import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { errorResponse } from "@/lib/api-helpers";
import { verifyOfficeContentToken } from "@/lib/onlyoffice";

/**
 * OnlyOffice Document Server'ın (kendi sunucusundan, tarayıcı oturumu OLMADAN)
 * dosya içeriğini indirmek için çağırdığı uç nokta. Kimlik doğrulama, config
 * oluşturulurken imzalanmış kısa ömürlü token ile yapılır (bkz. onlyoffice.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get("token");
    const payload = token ? await verifyOfficeContentToken(token) : null;
    if (!payload || payload.fileId !== id) {
      return NextResponse.json({ error: "Geçersiz veya süresi dolmuş token" }, { status: 401 });
    }

    const version = await prisma.fileVersion.findUnique({ where: { id: payload.versionId } });
    if (!version || version.fileId !== id) {
      return NextResponse.json({ error: "Versiyon bulunamadı" }, { status: 404 });
    }

    const buffer = await readFile(version.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
