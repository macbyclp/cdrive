"use client";

import OrdersScreen from "@/components/OrdersScreen";

/** Muhasebe ekranı — tüm siparişler, onay/fatura durumu ve tahsilat burada yönetilir. Sipariş açmak için bkz. /orders. */
export default function AccountingPage() {
  return <OrdersScreen mode="accounting" />;
}
