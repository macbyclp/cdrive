"use client";

import OrdersScreen from "@/components/OrdersScreen";

/** Satış ekranı — sipariş açma ve kendi siparişlerinizin durumunu takip etme. Onay/tahsilat için bkz. /accounting. */
export default function OrdersPage() {
  return <OrdersScreen mode="sales" />;
}
