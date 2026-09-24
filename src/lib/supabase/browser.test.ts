import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  parsePublicEnv: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createSupabaseBrowserClient,
}));

vi.mock("@/lib/env", () => ({
  parsePublicEnv: mocks.parsePublicEnv,
}));

import { createBrowserClient } from "./browser";

describe("createBrowserClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-role-key");
    mocks.parsePublicEnv.mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
  });

  it("passes only explicit public variables through validation to Supabase", () => {
    createBrowserClient();

    expect(mocks.parsePublicEnv).toHaveBeenCalledWith({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(mocks.createSupabaseBrowserClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
    );
  });
});
