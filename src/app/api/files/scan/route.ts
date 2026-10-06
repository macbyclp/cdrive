import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUnrestrictedUser } from "@/lib/auth";
import { canAccessFolder, assertQuota } from "@/lib/access";
import { assertFilePolicy } from "@/lib/policy";
import { createFileFromBuffer } from "@/lib/file-versions";
import { notifyIfQuotaWarning } from "@/lib/quota-notify";
import { clampForTextColumn } from "@/lib/text-extract";
import { ocrImage } from "@/lib/invoice-extract";
import { buildDocxFromPages, DOCX_MIME } from "@/lib/scan-docx";
import { buildPdfFromImages, detectImageType, MAX_SCAN_PAGES, MAX_SCAN_PAGE_BYTES, ScanError } from "@/lib/scan-pdf";
import { logAudit } from "@/lib/audit";
import { imageDimensions } from "@/lib/security";

// Piksel bombası koruması: PDFKit görüntüyü açarken bellek ayırır; sıkıştırılmış boyut küçük olsa da
// bildirilen piksel sayısı büyük olabilir. İstemci sayfaları zaten ≤2200px küçültür.
const MAX_PAGE_PIXELS = 40_000_000;
const MAX_TOTAL_PIXELS = 160_000_000;
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

export const maxDuration = 120;
const OCR_BUDGET_MS = 90_000;

function safeStem(raw: string): string {
  const base = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const stem = base || "Tarama";
  return stem.toLowerCase().endsWith(".pdf") ? stem.slice(0, -4) : stem;
}

/** Aynı klasörde aynı isimli dosya varsa üzerine yazma — " (2)", " (3)" ekle. */
async function uniqueName(folderId: string | null, stem: string, ext: string): Promise<string> {
  let name = `${stem}${ext}`;
  for (let n = 2; await prisma.file.findFirst({ where: { folderId, name, deletedAt: null } }); n++) {
    name = `${stem} (${n})${ext}`;
  }
  return name;
}

/** Taranan sayfa görüntülerinden (sayfa sırasıyla) tek bir PDF üretip klasöre kaydeder. */
export async function POST(req: Request) {
  try {
    const user = await requireUnrestrictedUser();
    const limited = limitOr429("scan", user.id, 20, 60000);
    if (limited) return limited;

    const form = await req.formData();
    const folderIdRaw = form.get("folderId");
    const folderId = typeof folderIdRaw === "string" && folderIdRaw.length > 0 ? folderIdRaw : null;
    const nameRaw = form.get("name");
    const wantDocx = form.get("docx") === "1";
    const ocr = form.get("ocr") === "1" || wantDocx; // Word çıktısı OCR gerektirir
    const pages = form.getAll("pages").filter((p): p is File => p instanceof File);

    if (pages.length === 0) throw new ScanError("En az bir sayfa gerekli");
    if (pages.length > MAX_SCAN_PAGES) throw new ScanError(`En fazla ${MAX_SCAN_PAGES} sayfa taranabilir`);

    if (folderId) {
      const ok = await canAccessFolder(user, folderId, "EDIT");
      if (!ok) return NextResponse.json({ error: "Bu klasöre yükleme izniniz yok" }, { status: 403 });
    }

    const images: Buffer[] = [];
    let totalPixels = 0;
    for (const page of pages) {
      if (page.size > MAX_SCAN_PAGE_BYTES) throw new ScanError("Bir sayfa görüntüsü çok büyük (en fazla 15 MB)");
      const buf = Buffer.from(await page.arrayBuffer());
      if (!detectImageType(buf)) throw new ScanError("Yalnızca JPEG veya PNG sayfa görüntüleri kabul edilir");
      const dims = imageDimensions(buf);
      if (!dims || dims.width < 1 || dims.height < 1 || dims.width * dims.height > MAX_PAGE_PIXELS) {
        throw new ScanError("Sayfa görüntüsünün piksel boyutu geçersiz veya çok büyük");
      }
      totalPixels += dims.width * dims.height;
      if (totalPixels > MAX_TOTAL_PIXELS) throw new ScanError("Toplam görüntü boyutu çok büyük");
      images.push(buf);
    }

    const pdf = await buildPdfFromImages(images);
    const stem = safeStem(typeof nameRaw === "string" ? nameRaw : "");
    const pdfName = await uniqueName(folderId, stem, ".pdf");
    await assertFilePolicy(pdfName, BigInt(pdf.byteLength));

    // OCR en iyi çabayla: başarısız olursa dosya yine kaydedilir, yalnızca içerik araması/Word çıktısı olmaz.
    let pageTexts: string[] | null = null;
    if (ocr) {
      try {
        const texts: string[] = [];
        const deadline = Date.now() + OCR_BUDGET_MS;
        for (const img of images) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) break; // süre dolduysa kalan sayfalar okunamaz, dosya yine kaydedilir
          const text = await Promise.race([
            ocrImage(img),
            new Promise<string>((resolve) => setTimeout(() => resolve(""), remaining)),
          ]);
          texts.push(text);
        }
        pageTexts = texts;
      } catch (e) {
        console.error("[scan] OCR başarısız:", e);
      }
    }
    const joined = pageTexts?.join("\n").trim() ?? "";
    const searchText = joined ? clampForTextColumn(joined) : null;

    // Düzenlenebilir Word çıktısı yalnızca gerçekten metin okunabildiyse üretilir.
    let docx: Buffer | null = null;
    if (wantDocx && pageTexts && joined) docx = await buildDocxFromPages(pageTexts);

    await assertQuota(user, BigInt(pdf.byteLength + (docx?.byteLength ?? 0)));
    const file = await createFileFromBuffer({
      name: pdfName,
      mimeType: "application/pdf",
      folderId,
      ownerId: user.id,
      buffer: pdf,
      searchText,
    });
    await logAudit({
      userId: user.id,
      action: "UPLOAD",
      targetType: "file",
      targetId: file.id,
      detail: `${pdfName} (tarama, ${images.length} sayfa${ocr ? ", OCR" : ""})`,
    });

    let docxName: string | null = null;
    if (docx) {
      docxName = await uniqueName(folderId, stem, ".docx");
      await assertFilePolicy(docxName, BigInt(docx.byteLength));
      const docxFile = await createFileFromBuffer({
        name: docxName,
        mimeType: DOCX_MIME,
        folderId,
        ownerId: user.id,
        buffer: docx,
        searchText,
      });
      await logAudit({
        userId: user.id,
        action: "UPLOAD",
        targetType: "file",
        targetId: docxFile.id,
        detail: `${docxName} (taramadan OCR ile üretildi)`,
      });
    }
    await notifyIfQuotaWarning(user.id);
    return NextResponse.json({ ...file, size: file.size.toString(), searchText: undefined, ocr: searchText !== null, docxName });
  } catch (err) {
    return errorResponse(err);
  }
}
