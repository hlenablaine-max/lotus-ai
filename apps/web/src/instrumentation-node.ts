// Retoma sozinho o trabalho dos agentes que ficou pela metade na última vez que o app foi fechado.
import { scheduleResume } from "@/lib/task-runner";

scheduleResume();
