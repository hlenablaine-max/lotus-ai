import { redirect } from "next/navigation";

// Links diretos para uma missão abrem a lista com o painel dela já aberto.
export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/missions?open=${encodeURIComponent(id)}`);
}
