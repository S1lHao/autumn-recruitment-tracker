import { describe, expect, it, vi } from "vitest";
import { getCurrentMemberWithDeps, requireMemberWithDeps } from "./authorization";

describe("getCurrentMemberWithDeps", () => {
  it("returns the exact accepted membership for the authenticated user", async () => {
    await expect(
      getCurrentMemberWithDeps({
        getUser: vi.fn().mockResolvedValue({ id: "user-id", email: "me@example.com" }),
        getMembership: vi.fn().mockResolvedValue({
          workspaceId: "workspace-id",
          email: "me@example.com",
          role: "admin",
        }),
      }),
    ).resolves.toEqual({
      userId: "user-id",
      workspaceId: "workspace-id",
      email: "me@example.com",
      role: "admin",
    });
  });

  it("identifies missing users and memberships for safe redirects", async () => {
    await expect(
      getCurrentMemberWithDeps({
        getUser: vi.fn().mockResolvedValue(null),
        getMembership: vi.fn(),
      }),
    ).resolves.toBeNull();
    await expect(
      getCurrentMemberWithDeps({
        getUser: vi.fn().mockResolvedValue({ id: "user-id", email: "me@example.com" }),
        getMembership: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toBeNull();
  });
});

describe("requireMemberWithDeps", () => {
  it("redirects safely for missing users or unaccepted memberships", async () => {
    const redirect = vi.fn((destination: string): never => {
      throw new Error(destination);
    });
    await expect(
      requireMemberWithDeps({
        getUser: vi.fn().mockResolvedValue(null),
        getMembership: vi.fn(),
        redirect,
      }),
    ).rejects.toThrow("/login");
    await expect(
      requireMemberWithDeps({
        getUser: vi.fn().mockResolvedValue({ id: "user-id" }),
        getMembership: vi.fn().mockResolvedValue(null),
        redirect,
      }),
    ).rejects.toThrow("/login?error=not_invited");
  });
});
