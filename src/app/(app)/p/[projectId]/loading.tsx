// Wird angezeigt, während das Projekt vom Server geladen wird
export default function Loading() {
  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6" aria-busy="true" aria-label="Projekt wird geladen">
      <div className="h-9 w-64 max-w-full rounded-lg bg-(--c-col-2) animate-pulse" />
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-(--c-col) animate-pulse" />
        ))}
      </div>
      <div className="flex gap-3.5 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-[1_0_250px] h-64 rounded-xl bg-(--c-col) animate-pulse" />
        ))}
      </div>
    </div>
  );
}
