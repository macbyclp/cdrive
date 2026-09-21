import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { collectVisibleFiles } from "@/lib/access";
import { errorResponse, limitOr429 } from "@/lib/api-helpers";

/** "type" filtresi için kategori → mimeType eşleşme kalıpları. */
const TYPE_FILTERS: Record<string, Prisma.FileWhereInput> = {
  image: { mimeType: { startsWith: "image/" } },
  video: { mimeType: { startsWith: "video/" } },
  audio: { mimeType: { startsWith: "audio/" } },
  pdf: { mimeType: "application/pdf" },
  document: { mimeType: { contains: "word" } },
  spreadsheet: { mimeType: { contains: "sheet" } },
  presentation: { mimeType: { contains: "presentation" } },
  archive: { OR: [{ mimeType: { contains: "zip" } }, { mimeType: { contains: "compressed" } }] },
};

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const limited = limitOr429("search", user.id, 60, 60000);
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const type = searchParams.get("type") ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const minSizeMb = searchParams.get("minSizeMb");
    const maxSizeMb = searchParams.get("maxSizeMb");
    // Sohbetteki "Sürücüden ekle" gibi yerler için — normal arama ADMIN'e her şeyi,
    // herkese de kendisiyle paylaşılmış dosyaları gösteriyor; bir sohbete eklerken
    // bilerek SADECE kullanıcının kendi sahip olduğu dosyalar aranabilsin diye
    // (gerçek hata: karşı tarafın kendi eklediği/paylaştığı dosyalar bile arama
    // sonuçlarında çıkıp tekrar eklenebiliyordu — kullanıcı bildirdi, düzeltildi).
    const mineOnly = searchParams.get("mine") === "1";

    // Sadece filtre uygulanmış, hiç metin girilmemiş bir arama da geçerli
    // ("bana sadece PDF'leri göster" gibi) — bu yüzden q boşken erken dönmüyoruz,
    // en azından bir filtre girildiyse devam ediyoruz.
    const hasFilters = !!(type || dateFrom || dateTo || minSizeMb || maxSizeMb);
    if (q.length < 1 && !hasFilters) return NextResponse.json({ files: [] });

    const extraWhere: Prisma.FileWhereInput[] = [];
    if (mineOnly) extraWhere.push({ ownerId: user.id });
    if (type && TYPE_FILTERS[type]) extraWhere.push(TYPE_FILTERS[type]);
    if (dateFrom || dateTo) {
      extraWhere.push({
        updatedAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
        },
      });
    }
    if (minSizeMb || maxSizeMb) {
      extraWhere.push({
        size: {
          ...(minSizeMb ? { gte: BigInt(Math.round(Number(minSizeMb) * 1024 ** 2)) } : {}),
          ...(maxSizeMb ? { lte: BigInt(Math.round(Number(maxSizeMb) * 1024 ** 2)) } : {}),
        },
      });
    }

    // MySQL doğal dil modu tam metin araması özel karakterlerde hata verebilir;
    // sadece harf/rakam/boşluk bırakıp terimleri normalize ediyoruz.
    const ftsQuery = q.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();

    type Row = Prisma.FileGetPayload<Record<string, never>>;
    const fetchPage = async (skip: number, take: number): Promise<Row[]> => {
      if (q.length < 1) {
        // Sadece filtre — metin araması yok.
        return prisma.file.findMany({
          where: { deletedAt: null, AND: extraWhere },
          skip,
          take,
          orderBy: { updatedAt: "desc" },
        });
      }
      const [byName, byContent] = await Promise.all([
        prisma.file.findMany({
          where: {
            deletedAt: null,
            // Not: MySQL'in varsayılan koleksiyon düzeni (utf8mb4_*_ci) zaten büyük/küçük
            // harf duyarsız karşılaştırma yapar; Postgres'teki gibi ayrı bir `mode` seçeneği yok.
            name: { contains: q },
            AND: extraWhere,
          },
          skip,
          take,
          orderBy: { updatedAt: "desc" },
        }),
        ftsQuery.length >= 3
          ? prisma.file.findMany({
              where: { deletedAt: null, searchText: { search: ftsQuery }, AND: extraWhere },
              skip,
              take,
              orderBy: { updatedAt: "desc" },
            })
          : Promise.resolve([] as Row[]),
      ]);
      const byId = new Map(byName.map((f) => [f.id, f]));
      for (const f of byContent) if (!byId.has(f.id)) byId.set(f.id, f);
      return [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    };

    // mineOnly zaten SQL WHERE'inde ownerId=user.id ile kısıtlı (yukarıda) — ADMIN istisnası bile
    // uygulanmıyor, bilerek: "Sürücüden ekle" SADECE kendi dosyalarını göstermeli. Diğer durumlarda
    // yetki süzgeci sayfa sayfa, toplu sorgularla uygulanır (dosya başına sorgu yok).
    const visible = mineOnly
      ? await fetchPage(0, 50)
      : await collectVisibleFiles(user, fetchPage, 50);

    return NextResponse.json({
      files: visible.slice(0, 50).map((f) => ({ ...f, size: f.size.toString(), searchText: undefined })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
