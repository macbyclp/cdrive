import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { filePermissionLevel } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ files: [] });

    const candidates = await prisma.file.findMany({
      where: {
        deletedAt: null,
        // Not: MySQL'in varsayılan koleksiyon düzeni (utf8mb4_*_ci) zaten büyük/küçük
        // harf duyarsız karşılaştırma yapar; Postgres'teki gibi ayrı bir `mode` seçeneği yok.
        name: { contains: q },
      },
      take: 200,
      orderBy: { updatedAt: "desc" },
    });

    const visible: typeof candidates = [];
    for (const f of candidates) {
      if (user.role === "ADMIN" || f.ownerId === user.id) {
        visible.push(f);
        continue;
      }
      const level = await filePermissionLevel(user, f.id);
      if (level) visible.push(f);
      if (visible.length >= 50) break;
    }

    return NextResponse.json({
      files: visible.slice(0, 50).map((f) => ({ ...f, size: f.size.toString() })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
