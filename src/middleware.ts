import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parsePublicEnv } from "@/lib/env";

const publicRoutes = new Set(["/login", "/auth/callback", "/auth/confirm"]);

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function middleware(request: NextRequest) {
  if (publicRoutes.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let environment: ReturnType<typeof parsePublicEnv>;
  try {
    environment = parsePublicEnv();
  } catch {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return copyResponseCookies(response, NextResponse.redirect(loginUrl));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|assets(?:/|$)).*)",
  ],
};
