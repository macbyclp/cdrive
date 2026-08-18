import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessFile } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";
import {
  officeDocType,
  extOf,
  isOnlyOfficeConfigured,
  signOfficeContentToken,
  signOnlyOfficeJwt,
} from "@/lib/onlyoffice";

// OnlyOffice editörünün sol üst köşesindeki logo alanı için basit bir SVG
// amblem ("Cd" vurgu renginde + "office" beyaz) — Document Server'ın koyu üst
// çubuğuna gömülmesi için transparan arka plan, önerilen ~172x40 boyutunda.
const BRAND_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="172" height="40" viewBox="0 0 172 40">
  <text x="6" y="27" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="21">
    <tspan fill="#818cf8">Cd</tspan><tspan fill="#ffffff">office</tspan>
  </text>
</svg>`;
const BRAND_LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(BRAND_LOGO_SVG).toString("base64")}`;

/**
 * Tarayıcının OnlyOffice editörünü açmak için ihtiyaç duyduğu imzalı config'i
 * üretir. Document Server bu config içindeki url'lere (document.url,
 * editorConfig.callbackUrl) KENDİSİ bağlanır — bu yüzden bunlar normal oturum
 * çerezi yerine kısa ömürlü bir "office token" taşır (bkz. src/lib/onlyoffice.ts).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();

    if (!isOnlyOfficeConfigured()) {
      return NextResponse.json(
        { error: "OnlyOffice Document Server yapılandırılmamış (ONLYOFFICE_URL eksik). README'ye bakın." },
        { status: 503 }
      );
    }

    const canView = await canAccessFile(user, id, "VIEW");
    if (!canView) return NextResponse.json({ error: "Bu dosyaya erişiminiz yok" }, { status: 403 });
    const canEdit = await canAccessFile(user, id, "EDIT");

    const file = await prisma.file.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!file || file.deletedAt || !file.currentVersion) {
      return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
    }

    const docType = officeDocType(file.name);
    if (!docType) {
      return NextResponse.json({ error: "Bu dosya türü Office editörüyle açılamaz" }, { status: 400 });
    }

    const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json(
        { error: "APP_URL tanımlı değil — Document Server'ın Cdrive'a ulaşabileceği herkese açık adres gerekli." },
        { status: 503 }
      );
    }

    const contentToken = await signOfficeContentToken({
      fileId: file.id,
      versionId: file.currentVersion.id,
      userId: user.id,
    });

    const config: Record<string, unknown> = {
      document: {
        fileType: extOf(file.name),
        key: `${file.id}-${file.currentVersion.id}`,
        title: file.name,
        url: `${appUrl}/api/files/${file.id}/office/content?token=${contentToken}`,
        permissions: { edit: canEdit, download: true, print: true, review: canEdit },
      },
      documentType: docType,
      editorConfig: {
        callbackUrl: `${appUrl}/api/files/${file.id}/office/callback?token=${contentToken}`,
        user: { id: user.id, name: user.name },
        mode: canEdit ? "edit" : "view",
        lang: "tr",
        // Editörün sol üstündeki "ONLYOFFICE" logosunu "Cdoffice" markasına
        // çeviriyor — bu, Document Server'a değil bize (bu config'e) ait bir
        // ayar olduğu için Document Server tarafında hiçbir değişiklik gerektirmez.
        customization: {
          logo: { image: BRAND_LOGO_DATA_URI, imageEmbedded: BRAND_LOGO_DATA_URI, url: appUrl },
        },
      },
      type: "desktop",
    };

    const officeJwt = await signOnlyOfficeJwt(config);
    if (officeJwt) config.token = officeJwt;

    return NextResponse.json({
      script: `${process.env.ONLYOFFICE_URL!.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`,
      config,
      fileName: file.name,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
