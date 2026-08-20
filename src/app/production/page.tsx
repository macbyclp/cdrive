"use client";

import OrdersScreen from "@/components/OrdersScreen";

/** Üretim ekranı — stoğu olmayıp "Üretimde" durumuna düşen siparişlerin kuyruğu. Stok kontrolü sipariş detayında (Onaylandı/Üretimde aşamasında) yapılır. */
export default function ProductionPage() {
  return <OrdersScreen mode="production" />;
}
