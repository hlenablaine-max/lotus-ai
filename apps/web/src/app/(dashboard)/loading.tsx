export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-pink-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-t-pink-500 animate-spin" />
        </div>
        <span className="text-sm text-zinc-500">Carregando…</span>
      </div>
    </div>
  )
}
