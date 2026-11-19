import { CeoChat } from "@/components/chat/ceo-chat";

export default async function CeoPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; clientName?: string }>;
}) {
  const { clientId, clientName } = await searchParams;
  return (
    <div className="h-full">
      <CeoChat initialClientId={clientId} initialClientName={clientName} />
    </div>
  );
}
