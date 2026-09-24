import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./env";

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

describe("environment validation", () => {
  it("rejects a missing service-role key in server configuration", () => {
    expect(() =>
      parseServerEnv({
        ...publicEnv,
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        INITIAL_ADMIN_EMAIL: "owner@example.com",
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("normalizes the initial administrator email", () => {
    expect(
      parseServerEnv({
        ...publicEnv,
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        INITIAL_ADMIN_EMAIL: "  OWNER@Example.COM  ",
      }).INITIAL_ADMIN_EMAIL,
    ).toBe("owner@example.com");
  });

  it("rejects invalid URLs and administrator email addresses", () => {
    expect(() =>
      parseServerEnv({
        ...publicEnv,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        INITIAL_ADMIN_EMAIL: "owner@example.com",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);

    expect(() =>
      parseServerEnv({
        ...publicEnv,
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        INITIAL_ADMIN_EMAIL: "not-an-email",
      }),
    ).toThrow(/INITIAL_ADMIN_EMAIL/);
  });

  it("parses public configuration without requiring server secrets", () => {
    expect(parsePublicEnv(publicEnv)).toEqual(publicEnv);
  });
});
