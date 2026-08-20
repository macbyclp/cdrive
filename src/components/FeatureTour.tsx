"use client";

import type { MeUser } from "@/lib/types";

type Feature = { icon: string; title: string; description: string };

/**
 * Kullanıcının GERÇEKTEN erişimi olan bölümleri listeler — AppSidebar'daki aynı
 * yetki mantığı (bkz. src/components/AppSidebar.tsx) burada da tekrarlanıyor,
 * çünkü elinde olmayan bir yetkiyi tanıtmak kafa karıştırır.
 */
function featuresFor(user: MeUser): Feature[] {
  const canOrders = user.role === "ADMIN" || user.canCreateOrders || user.canManageOrders || user.canManageProduction;
  const canAdmin = user.role === "ADMIN" || user.role === "MANAGER";

  const list: Feature[] = [
    {
      icon: "🗂️",
      title: "Sürücüm",
      description: "Dosya/klasör yükleme, sürükle-bırak, versiyonlama, paylaşım bağlantıları, çöp kutusu ve tam metin arama.",
    },
    {
      icon: "📊",
      title: "Genel Bakış",
      description: "Bu ay sipariş/ciro özeti, bekleyen bakiye, son siparişin durumu ve müşteri haritası tek ekranda.",
    },
  ];
  if (user.role === "ADMIN" || user.canCreateOrders) {
    list.push({ icon: "🛒", title: "Satış", description: "Yeni sipariş aç, kendi açtığın siparişlerin durumunu takip et." });
  }
  if (user.role === "ADMIN" || user.canManageOrders) {
    list.push({ icon: "🧾", title: "Muhasebe", description: "Tüm siparişleri onayla/faturalandır, tahsilat kaydet, fatura/makbuz indir." });
  }
  if (user.role === "ADMIN" || user.canManageProduction) {
    list.push({ icon: "🏭", title: "Üretim", description: "Stoğu olmayan sipariş kalemlerini işaretle, üretim kuyruğunu takip et." });
  }
  if (canOrders) {
    list.push({ icon: "👥", title: "Müşteriler", description: "Müşteri bazlı sipariş geçmişi ve ciro/tahsilat özeti." });
  }
  if (canAdmin) {
    list.push({ icon: "⚙️", title: "Yönetim", description: "Kullanıcı/departman yönetimi, yetkiler, depolama kotası, audit log." });
  }
  list.push({
    icon: "🙍",
    title: "Hesap Ayarları",
    description: "Avatarını özelleştir, şifreni değiştir, iki adımlı doğrulamayı (2FA) aç, açık oturumlarını yönet.",
  });
  return list;
}

export default function FeatureTour({ user, onClose }: { user: MeUser; onClose: () => void }) {
  const features = featuresFor(user);
  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        className="dialog-panel flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="border-b p-5 pb-3" style={{ borderColor: "var(--border)" }}>
          <div
            className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), #a78bfa)" }}
          >
            C
          </div>
          <h2 className="text-center text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Cdrive&apos;a hoş geldin{user.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Hesabınla eriştiğin bölümlere hızlı bir bakış:
          </p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <span className="text-xl">{f.icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {f.title}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t p-4" style={{ borderColor: "var(--border)" }}>
          <button className="btn-primary" onClick={onClose}>
            Anladım, başlayalım
          </button>
        </div>
      </div>
    </div>
  );
}
