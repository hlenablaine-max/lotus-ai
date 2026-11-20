// Retoma sozinho o trabalho dos agentes que ficou pela metade na última vez que o app foi fechado,
// e liga as automações do WhatsApp das clínicas (lembretes, avaliações, retornos...).
import { scheduleResume } from "@/lib/task-runner";
import { scheduleWhatsappAutomations } from "@/lib/whatsapp-automations";

scheduleResume();
scheduleWhatsappAutomations();
