export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--background)" }}>
      <div className="skeleton h-3 w-40" role="status" aria-label="Yükleniyor" />
    </div>
  );
}
