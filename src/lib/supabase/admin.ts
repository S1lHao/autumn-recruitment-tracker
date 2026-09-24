import "server-only";

import { createClient } from "@supabase/supabase-js";
import { parseServerEnv } from "@/lib/env";

/**
 * Creates a privileged server-only client. Never import this module from a
 * Client Component or expose the returned client to the browser.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
    parseServerEnv();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
