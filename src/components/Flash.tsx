/** Flash message rendered from ?flash= & ?ok= search params. */

export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flash = searchParams.flash;
  const ok = searchParams.ok !== "0";
  if (!flash || typeof flash !== "string") return null;
  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
      }`}
    >
      <span className="mt-0.5">{ok ? "✓" : "⚠"}</span>
      <span>{flash}</span>
    </div>
  );
}
