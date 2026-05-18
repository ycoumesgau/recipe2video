import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Chaque étape Inngest s’exécute dans cette route ; sans `maxDuration`, Vercel
// coupe l’invocation (FUNCTION_INVOCATION_TIMEOUT) bien avant le dev local.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
