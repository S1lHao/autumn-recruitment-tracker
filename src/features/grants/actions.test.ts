import { describe, expect, it, vi } from "vitest";
import {
  createEditGrantWithDeps,
  revokeEditGrantWithDeps,
  type GrantActionDependencies,
} from "./actions";
import { grantInput, parseGrantInput, revokeGrantInput } from "./schemas";

const OWNER_ID = "00000000-0000-4000-8000-000000000010";
const GRANTEE_ID = "00000000-0000-4000-8000-000000000020";
const OTHER_ID = "00000000-0000-4000-8000-000000000030";
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000100";
const GRANT_ID = "00000000-0000-4000-8000-000000000200";
const NOW = new Date("2026-09-07T04:00:00.000Z");

function dependencies(overrides: Partial<GrantActionDependencies> = {}): GrantActionDependencies {
  return {
    currentMember: vi.fn().mockResolvedValue({
      userId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      email: "owner@example.com",
      role: "member",
    }),
    findWorkspaceMember: vi.fn().mockResolvedValue({ ok: true, found: true }),
    createGrantAtomic: vi.fn().mockResolvedValue({
      data: { id: GRANT_ID, workspaceId: WORKSPACE_ID, ownerId: OWNER_ID, granteeId: GRANTEE_ID, expiresAt: "2026-09-07T05:00:00.000Z" },
      error: null,
    }),
    revokeGrantAtomic: vi.fn().mockResolvedValue({ data: { id: GRANT_ID }, error: null }),
    now: () => NOW,
    revalidate: vi.fn(),
    ...overrides,
  };
}

describe("grant validation", () => {
  it("rejects malformed ids and an expiry in the past", () => {
    expect(grantInput.safeParse({ granteeId: "not-a-uuid", expiresAt: "2026-09-07T05:00:00.000Z" }).success).toBe(false);
    expect(parseGrantInput({ granteeId: GRANTEE_ID, expiresAt: "2026-09-07T03:59:59.999Z" }, NOW).success).toBe(false);
    expect(revokeGrantInput.safeParse({ grantId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts an ISO instant up to 30 days and rejects anything later", () => {
    expect(parseGrantInput({ granteeId: GRANTEE_ID, expiresAt: "2026-10-07T04:00:00.000Z" }, NOW).success).toBe(true);
    expect(parseGrantInput({ granteeId: GRANTEE_ID, expiresAt: "2026-10-07T04:00:00.001Z" }, NOW).success).toBe(false);
    expect(parseGrantInput({ granteeId: GRANTEE_ID, expiresAt: "2026-09-07T12:00" }, NOW).success).toBe(false);
  });
});

describe("createEditGrantWithDeps", () => {
  it("derives the owner and workspace from the session and uses one atomic operation", async () => {
    const deps = dependencies();
    await expect(createEditGrantWithDeps({ granteeId: GRANTEE_ID, expiresAt: "2026-09-07T05:00:00.000Z" }, deps)).resolves.toEqual({
      ok: true,
      data: { id: GRANT_ID, workspaceId: WORKSPACE_ID, ownerId: OWNER_ID, granteeId: GRANTEE_ID, expiresAt: "2026-09-07T05:00:00.000Z" },
    });
    expect(deps.createGrantAtomic).toHaveBeenCalledTimes(1);
    expect(deps.createGrantAtomic).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      ownerId: OWNER_ID,
      granteeId: GRANTEE_ID,
      expiresAt: "2026-09-07T05:00:00.000Z",
    });
    expect(deps.revalidate).toHaveBeenCalledWith("/");
  });

  it("rejects self grants and members outside the current workspace", async () => {
    const self = dependencies();
    await expect(createEditGrantWithDeps({ granteeId: OWNER_ID, expiresAt: "2026-09-07T05:00:00.000Z" }, self)).resolves.toEqual({ ok: false, message: "不能给自己授权编辑" });
    expect(self.createGrantAtomic).not.toHaveBeenCalled();

    const outsider = dependencies({ findWorkspaceMember: vi.fn().mockResolvedValue({ ok: true, found: false }) });
    await expect(createEditGrantWithDeps({ granteeId: OTHER_ID, expiresAt: "2026-09-07T05:00:00.000Z" }, outsider)).resolves.toEqual({ ok: false, message: "被授权成员不在当前工作区" });
    expect(outsider.createGrantAtomic).not.toHaveBeenCalled();
  });

  it("does not let a caller delegate on another owner's behalf", async () => {
    const deps = dependencies({
      currentMember: vi.fn().mockResolvedValue({ userId: GRANTEE_ID, workspaceId: WORKSPACE_ID, email: "grantee@example.com", role: "member" }),
    });
    await expect(createEditGrantWithDeps({ ownerId: OWNER_ID, granteeId: OTHER_ID, expiresAt: "2026-09-07T05:00:00.000Z" }, deps)).resolves.toEqual({ ok: false, message: "只有记录所有者可以授权编辑" });
    expect(deps.createGrantAtomic).not.toHaveBeenCalled();
  });

  it("fails closed on membership or atomic persistence errors", async () => {
    const lookupFailure = dependencies({ findWorkspaceMember: vi.fn().mockResolvedValue({ ok: false }) });
    await expect(createEditGrantWithDeps({ granteeId: GRANTEE_ID, expiresAt: "2026-09-07T05:00:00.000Z" }, lookupFailure)).resolves.toEqual({ ok: false, message: "成员校验失败，请稍后重试" });

    const databaseFailure = dependencies({ createGrantAtomic: vi.fn().mockResolvedValue({ data: null, error: new Error("raw") }) });
    await expect(createEditGrantWithDeps({ granteeId: GRANTEE_ID, expiresAt: "2026-09-07T05:00:00.000Z" }, databaseFailure)).resolves.toEqual({ ok: false, message: "编辑授权创建失败，请稍后重试" });
    expect(databaseFailure.revalidate).not.toHaveBeenCalled();
  });
});

describe("revokeEditGrantWithDeps", () => {
  it("scopes revocation to the signed-in owner and revalidates", async () => {
    const deps = dependencies();
    await expect(revokeEditGrantWithDeps({ grantId: GRANT_ID }, deps)).resolves.toEqual({ ok: true });
    expect(deps.revokeGrantAtomic).toHaveBeenCalledWith({ grantId: GRANT_ID, workspaceId: WORKSPACE_ID, ownerId: OWNER_ID });
    expect(deps.revalidate).toHaveBeenCalledWith("/");
  });

  it("returns a safe error unless exactly one owned grant is revoked", async () => {
    const deps = dependencies({ revokeGrantAtomic: vi.fn().mockResolvedValue({ data: null, error: null }) });
    await expect(revokeEditGrantWithDeps({ grantId: GRANT_ID }, deps)).resolves.toEqual({ ok: false, message: "编辑授权撤销失败，请稍后重试" });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
});
