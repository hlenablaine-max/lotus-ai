import { CeoChat } from "@/components/chat/ceo-chat";

export default async function CeoPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; clientName?: string; prompt?: string }>;
}) {
  const { clientId, clientName, prompt } = await searchParams;
  return (
    <div className="h-full">
      <CeoChat initialClientId={clientId} initialClientName={clientName} initialPrompt={prompt} />
    </div>
  );
}
