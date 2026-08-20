import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canCreateOrder } from "@/lib/access";
import { errorResponse } from "@/lib/api-helpers";

const itemSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.number().min(0).max(100_000_000),
});

function serialize(t: {
  id: string;
  name: string;
  customerName: string;
  customerContact: string | null;
  notes: string | null;
  items: string;
  createdAt: Date;
  createdById: string;
  createdBy: { name: string };
}) {
  return {
    id: t.id,
    name: t.name,
    customerName: t.customerName,
    customerContact: t.customerContact,
    notes: t.notes,
    items: JSON.parse(t.items) as { productName: string; quantity: number; unitPrice: number }[],
    createdAt: t.createdAt.toISOString(),
    createdById: t.createdById,
    createdByName: t.createdBy.name,
  };
}

/** Şablon listesi — sipariş oluşturma yetkisi olan HERKES tüm şablonları görür (takım içi paylaşımlı). */
export async function GET() {
  try {
    const user = await requireUser();
    if (!canCreateOrder(user)) return NextResponse.json({ error: "Bu bölüme erişiminiz yok" }, { status: 403 });
    const templates = await prisma.orderTemplate.findMany({
      orderBy: { name: "asc" },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json(templates.map(serialize));
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  customerName: z.string().trim().min(1).max(200),
  customerContact: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  items: z.array(itemSchema).min(1).max(100),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canCreateOrder(user)) return NextResponse.json({ error: "Bu bölüme erişiminiz yok" }, { status: 403 });
    const body = createSchema.parse(await req.json());

    const template = await prisma.orderTemplate.create({
      data: {
        name: body.name,
        customerName: body.customerName,
        customerContact: body.customerContact || null,
        notes: body.notes || null,
        items: JSON.stringify(body.items),
        createdById: user.id,
      },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json(serialize(template));
  } catch (err) {
    return errorResponse(err);
  }
}
