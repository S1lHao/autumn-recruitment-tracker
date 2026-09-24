import { describe, expect, it, vi } from "vitest";
import { listOwnedActiveGrantsWithDeps } from "./queries";

const member = {
  userId: "00000000-0000-4000-8000-000000000010",
  workspaceId: "00000000-0000-4000-8000-000000000100",
  email: "owner@example.com",
  role: "member" as const,
};

describe("owned active grant query", () => {
  it("derives its scope from the session and maps exact active rows", async () => {
    const listOwnedActive = vi.fn().mockResolvedValue({
      data: [{
        id: "00000000-0000-4000-8000-000000000200",
        workspace_id: member.workspaceId,
        owner_id: member.userId,
        grantee_id: "00000000-0000-4000-8000-000000000020",
        expires_at: "2026-09-08T01:30:00.000Z",
      }],
      error: null,
    });
    await expect(listOwnedActiveGrantsWithDeps({ currentMember: async () => member, listOwnedActive }, new Date("2026-09-07T04:00:00.000Z"))).resolves.toEqual({
      ok: true,
      data: [{
        id: "00000000-0000-4000-8000-000000000200",
        workspaceId: member.workspaceId,
        ownerId: member.userId,
        granteeId: "00000000-0000-4000-8000-000000000020",
        expiresAt: "2026-09-08T01:30:00.000Z",
      }],
    });
    expect(listOwnedActive).toHaveBeenCalledWith({ workspaceId: member.workspaceId, ownerId: member.userId, now: "2026-09-07T04:00:00.000Z" });
  });

  it("fails closed on database errors or rows outside the session scope", async () => {
    await expect(listOwnedActiveGrantsWithDeps({
      currentMember: async () => member,
      listOwnedActive: async () => ({ data: null, error: new Error("raw") }),
    })).resolves.toEqual({ ok: false, message: "编辑权限加载失败，请稍后重试" });

    await expect(listOwnedActiveGrantsWithDeps({
      currentMember: async () => member,
      listOwnedActive: async () => ({ data: [{ id: "g", workspace_id: "other", owner_id: member.userId, grantee_id: "u", expires_at: "2026-09-08T01:30:00.000Z" }], error: null }),
    })).resolves.toEqual({ ok: false, message: "编辑权限加载失败，请稍后重试" });
  });
});
