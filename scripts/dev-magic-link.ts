// Dev-only helper: emit a one-shot magic link for an allowlisted user so a
// cloud agent (or a developer with no inbox access) can step through the
// dashboard during manual testing. Never deploy / commit logs from this
// script — the URL grants a full session for the target user.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const email = process.argv[2] ?? "yoann@licorn.org";
const baseUrl = process.env.APP_BASE_URL ?? `http://${"localhost"}:3000`; // pragma: allowlist secret
const redirectTo = process.argv[3] ?? `${baseUrl}/`;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
}

async function main() {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(data.properties?.action_link ?? "(no link returned)");
}

main();
