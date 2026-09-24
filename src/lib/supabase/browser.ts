"use client";

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import { parsePublicEnv } from "@/lib/env";

/** Creates a browser client using only values safe to expose to users. */
export function createBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });

  return createSupabaseBrowserClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
