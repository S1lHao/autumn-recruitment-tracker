import type { Browser } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  assertLocalSiteUrl,
  assertLocalSupabaseUrl,
  createRecruitmentFixture,
  createRetryableCleanup,
  loadE2EEnvironment,
  runSetupWithCleanup,
  settleSetupOperations,
  type E2EEnvironment,
} from "./supabase-admin";

describe("E2E environment safety", () => {
  it.each(["http://127.0.0.1:54321", "http://127.0.0.1:54321/"])("accepts the local Supabase API at %s", (value) => {
    expect(assertLocalSupabaseUrl(value).origin).toBe(value.replace(/\/$/, ""));
  });

  it.each([
    "https://project.supabase.co",
    "http://localhost.example.com:54321",
    "http://user:secret@127.0.0.1:54321",
    "ftp://127.0.0.1:54321",
    "https://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
    "http://127.0.0.1:54322",
    "http://127.0.0.1:54321/rest/v1",
    "http://127.0.0.1:54321?",
    "http://127.0.0.1:54321#",
  ])("refuses a non-isolated Supabase target at %s", (value) => {
    expect(() => assertLocalSupabaseUrl(value)).toThrow(/local Supabase API/);
  });

  it("only accepts the dedicated loopback Next.js server", () => {
    expect(assertLocalSiteUrl("http://127.0.0.1:3000").origin).toBe("http://127.0.0.1:3000");
    expect(assertLocalSiteUrl("http://127.0.0.1:3000/").origin).toBe("http://127.0.0.1:3000");
    expect(() => assertLocalSiteUrl("https://tracker.example.com")).toThrow(/local Next.js server/);
    expect(() => assertLocalSiteUrl("https://127.0.0.1:3000")).toThrow(/local Next.js server/);
    expect(() => assertLocalSiteUrl("http://localhost:3000")).toThrow(/local Next.js server/);
    expect(() => assertLocalSiteUrl("http://[::1]:3000")).toThrow(/local Next.js server/);
    expect(() => assertLocalSiteUrl("http://127.0.0.1:3001")).toThrow(/local Next.js server/);
  });

  it("requires the same five values used by the application", () => {
    expect(() => loadE2EEnvironment({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(loadE2EEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
      INITIAL_ADMIN_EMAIL: "owner@example.test",
    })).toMatchObject({
      supabaseUrl: "http://127.0.0.1:54321",
      siteUrl: "http://127.0.0.1:3000",
    });
  });

  it("revalidates explicitly passed fixture environments before creating a client", async () => {
    const unsafeEnvironment: E2EEnvironment = {
      supabaseUrl: "https://production-project.supabase.co",
      anonKey: "fake-anon-key",
      serviceRoleKey: "fake-service-role-key",
      siteUrl: "http://127.0.0.1:3000",
      initialAdminEmail: "owner@example.test",
    };

    await expect(
      createRecruitmentFixture({} as Browser, unsafeEnvironment),
    ).rejects.toThrow(/local Supabase API/);

    await expect(createRecruitmentFixture({} as Browser, {
      ...unsafeEnvironment,
      supabaseUrl: "http://127.0.0.1:54321",
      siteUrl: "https://tracker.example.com",
    })).rejects.toThrow(/local Next.js server/);
  });
});

describe("E2E teardown coordination", () => {
  it("only marks cleanup complete after success so a partial failure can be retried", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("partial delete failure"))
      .mockResolvedValueOnce(undefined);
    const cleanup = createRetryableCleanup(operation);

    await expect(cleanup()).rejects.toThrow("partial delete failure");
    await expect(cleanup()).resolves.toBeUndefined();
    await expect(cleanup()).resolves.toBeUndefined();
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("waits for every parallel auth-state write before cleanup starts", async () => {
    const events: string[] = [];
    let releaseSlowWrite: (() => void) | undefined;
    const slowWrite = new Promise<void>((resolve) => {
      releaseSlowWrite = () => {
        events.push("slow write settled");
        resolve();
      };
    });
    const cleanup = vi.fn(async () => {
      events.push("cleanup");
    });
    const setup = runSetupWithCleanup(
      () => settleSetupOperations([Promise.reject(new Error("owner write failed")), slowWrite]),
      cleanup,
    );

    await Promise.resolve();
    expect(cleanup).not.toHaveBeenCalled();
    releaseSlowWrite?.();
    await expect(setup).rejects.toThrow(/parallel E2E setup failed/);
    expect(events).toEqual(["slow write settled", "cleanup"]);
  });
});
