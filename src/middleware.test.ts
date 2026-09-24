import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  parsePublicEnv: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/env", () => ({
  parsePublicEnv: mocks.parsePublicEnv,
}));

import { config, middleware } from "./middleware";

const routeMatcher = new RegExp(config.matcher[0]);

type SetAll = (
  cookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }>,
  headers: Record<string, string>,
) => void;

describe("middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.parsePublicEnv.mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    mocks.createServerClient.mockReturnValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });

  it("matches file-like product routes so they reach the authentication check", async () => {
    expect(routeMatcher.test("/report.pdf")).toBe(true);
    expect(routeMatcher.test("/api/export.json")).toBe(true);
    expect(routeMatcher.test("/future-product.css")).toBe(true);

    const response = await middleware(
      new NextRequest("https://example.test/report.pdf"),
    );

    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "https://example.test/login?next=%2Freport.pdf",
    );
  });

  it("forwards refreshed session cookies when redirecting to login", async () => {
    let setAll: SetAll | undefined;
    mocks.createServerClient.mockImplementation((_, __, options) => {
      setAll = options.cookies.setAll as SetAll;
      return { auth: { getUser: mocks.getUser } };
    });
    mocks.getUser.mockImplementation(async () => {
      setAll?.(
        [
          {
            name: "sb-access-token",
            value: "refreshed-token",
            options: { path: "/", httpOnly: true },
          },
        ],
        { "Cache-Control": "private, no-store" },
      );
      return { data: { user: null } };
    });

    const response = await middleware(
      new NextRequest("https://example.test/applications"),
    );

    expect(response.cookies.get("sb-access-token")?.value).toBe(
      "refreshed-token",
    );
  });

  it("skips authentication for the login route", async () => {
    await middleware(new NextRequest("https://example.test/login"));

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("keeps the scanner-safe confirmation page public", async () => {
    await middleware(
      new NextRequest("https://example.test/auth/confirm?token_hash=token&type=email"),
    );

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
