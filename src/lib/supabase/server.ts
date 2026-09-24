import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parsePublicEnv } from "@/lib/env";

function isReadOnlyCookieError(error: unknown) {
  return (
    error instanceof Error &&
    /cookies can only be modified in a server action or route handler/i.test(
      error.message,
    )
  );
}

/**
 * Creates a cookie-aware Supabase server client.
 *
 * Server Components may read cookies but cannot persist a refreshed session;
 * that specific Next.js error is intentionally ignored. Server Actions and
 * route handlers remain able to write refreshed cookies.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    parsePublicEnv();

  return createSupabaseServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch (error) {
            if (!isReadOnlyCookieError(error)) {
              throw error;
            }
          }
        },
      },
    },
  );
}
