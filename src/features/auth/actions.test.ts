import { describe, expect, it, vi } from "vitest";
import {
  inviteMemberWithDeps,
  requestLoginLinkWithDeps,
  revokeFailedInvitation,
  type InviteMemberDependencies,
  type LoginDependencies,
} from "./actions";

function loginDeps(overrides: Partial<LoginDependencies> = {}): LoginDependencies {
  return {
    initialAdminEmail: "owner@example.com",
    siteUrl: "https://tracker.example.com",
    hasExistingMember: vi.fn().mockResolvedValue(false),
    hasActiveInvitation: vi.fn().mockResolvedValue(false),
    sendOtp: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("requestLoginLinkWithDeps", () => {
  it("rejects an uninvited address without sending an OTP", async () => {
    const deps = loginDeps();

    await expect(requestLoginLinkWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "该邮箱尚未受邀",
    });
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });

  it("normalizes the initial administrator address and permits account creation", async () => {
    const deps = loginDeps();

    await expect(
      requestLoginLinkWithDeps(" OWNER@Example.COM ", deps),
    ).resolves.toEqual({ ok: true });
    expect(deps.sendOtp).toHaveBeenCalledWith(
      "owner@example.com",
      true,
      "https://tracker.example.com/auth/callback",
    );
  });

  it("does not create an account for an existing member", async () => {
    const deps = loginDeps({ hasExistingMember: vi.fn().mockResolvedValue(true) });

    await expect(requestLoginLinkWithDeps("member@example.com", deps)).resolves.toEqual({
      ok: true,
    });
    expect(deps.sendOtp).toHaveBeenCalledWith(
      "member@example.com",
      false,
      "https://tracker.example.com/auth/callback",
    );
  });

  it("does not recreate the initial administrator after they become a member", async () => {
    const deps = loginDeps({ hasExistingMember: vi.fn().mockResolvedValue(true) });

    await expect(requestLoginLinkWithDeps("owner@example.com", deps)).resolves.toEqual({
      ok: true,
    });
    expect(deps.sendOtp).toHaveBeenCalledWith(
      "owner@example.com",
      false,
      "https://tracker.example.com/auth/callback",
    );
  });

  it("permits account creation for a valid pending invitation", async () => {
    const deps = loginDeps({ hasActiveInvitation: vi.fn().mockResolvedValue(true) });

    await requestLoginLinkWithDeps("invitee@example.com", deps);

    expect(deps.sendOtp).toHaveBeenCalledWith(
      "invitee@example.com",
      true,
      "https://tracker.example.com/auth/callback",
    );
  });

  it("does not treat an undelivered pending invitation as a login allowlist", async () => {
    const deps = loginDeps({ hasActiveInvitation: vi.fn().mockResolvedValue(false) });

    await expect(requestLoginLinkWithDeps("undelivered@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "该邮箱尚未受邀",
    });
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });

  it("returns a safe result when the passwordless provider is unavailable", async () => {
    const deps = loginDeps({ sendOtp: vi.fn().mockRejectedValue(new Error("provider unavailable")) });

    await expect(requestLoginLinkWithDeps("owner@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "登录链接发送失败，请稍后重试",
    });
  });

  it("returns a stable validation error before external calls", async () => {
    const deps = loginDeps();

    await expect(requestLoginLinkWithDeps("not-an-email", deps)).resolves.toEqual({
      ok: false,
      message: "请输入有效的邮箱地址",
      fieldErrors: { email: ["请输入有效的邮箱地址"] },
    });
    expect(deps.hasExistingMember).not.toHaveBeenCalled();
    expect(deps.hasActiveInvitation).not.toHaveBeenCalled();
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });
});

function inviteDeps(
  overrides: Partial<InviteMemberDependencies> = {},
): InviteMemberDependencies {
  return {
    currentMember: vi.fn().mockResolvedValue({
      userId: "admin-id",
      workspaceId: "workspace-id",
      email: "owner@example.com",
      role: "admin",
    }),
    hasExistingMember: vi.fn().mockResolvedValue(false),
    createInvitation: vi.fn().mockResolvedValue({ invitation: { id: "invite-id" } }),
    sendInvite: vi.fn().mockResolvedValue(true),
    activateInvitation: vi.fn().mockResolvedValue(true),
    revokeInvitation: vi.fn().mockResolvedValue(true),
    siteUrl: "https://tracker.example.com",
    now: () => new Date("2026-09-04T08:00:00.000Z"),
    ...overrides,
  };
}

describe("inviteMemberWithDeps", () => {
  it("only lets an admin create a seven-day invitation and dispatch its email", async () => {
    const activateInvitation = vi.fn().mockResolvedValue(true);
    const sendInvite = vi.fn().mockResolvedValue(true);
    const deps = inviteDeps({
      activateInvitation,
      sendInvite,
    } as Partial<InviteMemberDependencies>);

    await expect(inviteMemberWithDeps(" New@Example.COM ", deps)).resolves.toEqual({
      ok: true,
    });
    expect(deps.createInvitation).toHaveBeenCalledWith({
      workspaceId: "workspace-id",
      invitedBy: "admin-id",
      email: "new@example.com",
      expiresAt: "2026-09-11T08:00:00.000Z",
    });
    expect(sendInvite).toHaveBeenCalledWith(
      "new@example.com",
      "https://tracker.example.com/auth/callback",
    );
    expect(activateInvitation).toHaveBeenCalledWith("invite-id");
    expect(sendInvite.mock.invocationCallOrder[0]).toBeLessThan(
      activateInvitation.mock.invocationCallOrder[0],
    );
  });

  it("maps non-duplicate invitation creation failures to a safe operational result", async () => {
    const deps = inviteDeps({
      createInvitation: vi.fn().mockResolvedValue({ errorCode: "database_unavailable" }),
    });

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "邀请创建失败，请稍后重试",
    });
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("maps the atomic existing-member RPC error to the member-specific message", async () => {
    const deps = inviteDeps({
      createInvitation: vi.fn().mockResolvedValue({ errorCode: "existing_workspace_member" }),
    });

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "该邮箱已是成员",
    });
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it("returns a distinct safe result when activation and compensation cannot be confirmed", async () => {
    const activateInvitation = vi.fn().mockResolvedValue(false);
    const revokeInvitation = vi.fn().mockResolvedValue(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = inviteDeps({
      activateInvitation,
      revokeInvitation,
    } as Partial<InviteMemberDependencies>);

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "邀请发送后的清理失败，请联系管理员",
    });
    expect(revokeInvitation).toHaveBeenCalledWith("invite-id");
    expect(error).toHaveBeenCalledWith(
      "invitation_compensation_failed",
      "invite-id",
      "activation_failed",
    );
    error.mockRestore();
  });

  it("compensates when the delivered marker cannot be activated", async () => {
    const activateInvitation = vi.fn().mockResolvedValue(false);
    const revokeInvitation = vi.fn().mockResolvedValue(true);
    const deps = inviteDeps({
      activateInvitation,
      revokeInvitation,
    } as Partial<InviteMemberDependencies>);

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "邀请激活失败，请稍后重试",
    });
    expect(activateInvitation).toHaveBeenCalledWith("invite-id");
    expect(revokeInvitation).toHaveBeenCalledWith("invite-id");
  });

  it("rejects non-admins", async () => {
    const deps = inviteDeps({
      currentMember: vi.fn().mockResolvedValue({
        userId: "member-id",
        workspaceId: "workspace-id",
        email: "member@example.com",
        role: "member",
      }),
    });

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "仅管理员可以邀请成员",
    });
    expect(deps.createInvitation).not.toHaveBeenCalled();
  });

  it.each(["member", "active pending invitation"])(
    "rejects a duplicate %s",
    async (kind) => {
      const deps = inviteDeps(
        kind === "member"
          ? { hasExistingMember: vi.fn().mockResolvedValue(true) }
          : {
              createInvitation: vi.fn().mockResolvedValue({
                errorCode: "active_pending_invitation_exists",
              }),
            },
      );

      await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
        ok: false,
        message: kind === "member" ? "该邮箱已是成员" : "该邮箱已有待处理邀请",
      });
      if (kind === "member") expect(deps.createInvitation).not.toHaveBeenCalled();
      expect(deps.sendInvite).not.toHaveBeenCalled();
    },
  );

  it("revokes the just-created invitation when delivery fails", async () => {
    const deps = inviteDeps({ sendInvite: vi.fn().mockResolvedValue(false) });

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "邀请邮件发送失败，请稍后重试",
    });
    expect(deps.revokeInvitation).toHaveBeenCalledWith("invite-id");
  });

  it("revokes the just-created invitation when delivery throws", async () => {
    const deps = inviteDeps({ sendInvite: vi.fn().mockRejectedValue(new Error("provider unavailable")) });

    await expect(inviteMemberWithDeps("new@example.com", deps)).resolves.toEqual({
      ok: false,
      message: "邀请邮件发送失败，请稍后重试",
    });
    expect(deps.revokeInvitation).toHaveBeenCalledWith("invite-id");
  });
});

describe("revokeFailedInvitation", () => {
  it("deletes the exact invitation when the revoke update returns an error", async () => {
    const revoke = vi.fn().mockResolvedValue({ error: new Error("update failed") });
    const remove = vi.fn().mockResolvedValue({ error: null });

    await expect(revokeFailedInvitation("invite-id", { revoke, remove })).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith("invite-id");
  });

  it("does not delete after a successful revoke update", async () => {
    const revoke = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn();

    await expect(revokeFailedInvitation("invite-id", { revoke, remove })).resolves.toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns a safe failure when both compensation operations return errors", async () => {
    const revoke = vi.fn().mockResolvedValue({ error: new Error("update failed") });
    const remove = vi.fn().mockResolvedValue({ error: new Error("delete failed") });

    await expect(revokeFailedInvitation("invite-id", { revoke, remove })).resolves.toBe(false);
    expect(remove).toHaveBeenCalledWith("invite-id");
  });
});
