import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div
        className="w-full max-w-sm rounded-2xl border p-8 text-center"
        style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
      >
        <p className="mb-2 text-4xl">🔎</p>
        <h1 className="mb-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          Sayfa bulunamadı
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link href="/drive" className="btn-primary inline-block w-full">
          Sürücüme dön
        </Link>
      </div>
    </div>
  );
}
