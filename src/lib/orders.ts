/** Sipariş API rotaları arasında paylaşılan include şekli + Decimal alanların JSON'a çevrilmesi. */
export const orderIncludeShape = {
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  items: true,
  attachments: { include: { file: { select: { id: true, name: true, mimeType: true } } } },
  payments: {
    include: { recordedBy: { select: { id: true, name: true, email: true } } },
    orderBy: { paidAt: "desc" as const },
  },
} as const;

export function serializeOrder(o: {
  items: { unitPrice: unknown; [k: string]: unknown }[];
  payments: { amount: unknown; [k: string]: unknown }[];
  [k: string]: unknown;
}) {
  return {
    ...o,
    items: o.items.map((i) => ({ ...i, unitPrice: i.unitPrice!.toString() })),
    payments: o.payments.map((p) => ({ ...p, amount: p.amount!.toString() })),
  };
}
