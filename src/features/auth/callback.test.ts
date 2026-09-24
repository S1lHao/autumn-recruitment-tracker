import { describe, expect, it, vi } from "vitest";
import {
  completeAuthCallback,
  INVALID_LINK,
  type CallbackDependencies,
  type CallbackParameters,
} from "./callback";

const verifiedUser = {
  id: "user-id",
  email: "invitee@example.com",
  emailConfirmedAt: "2026-09-04T08:00:00.000Z",
};

function callbackDeps(overrides: Partial<CallbackDependencies> = {}): CallbackDependencies {
  return {
    exchangeCode: vi.fn().mockResolvedValue(true),
    verifyToken: vi.fn().mockResolvedValue(true),
    getVerifiedUser: vi.fn().mockResolvedValue(verifiedUser),
    hasMembership: vi.fn().mockResolvedValue(false),
    acceptPendingInvitation: vi.fn().mockResolvedValue(true),
    bootstrapWorkspace: vi.fn().mockResolvedValue(true),
    initialAdminEmail: "owner@example.com",
    ...overrides,
  };
}

describe("completeAuthCallback", () => {
  it("returns the fixed invalid destination when code exchange fails", async () => {
    const deps = callbackDeps({ exchangeCode: vi.fn().mockResolvedValue(false) });

    await expect(completeAuthCallback({ code: "invalid-code" }, deps)).resolves.toBe(INVALID_LINK);
  });

  it.each<[CallbackParameters, string]>([
    [{ tokenHash: "token", type: "recovery" }, "unsupported token type"],
    [{}, "no supported credential"],
  ])("rejects %s without making auth calls", async (parameters, _description) => {
    void _description;
    const rejectedAuthCall = vi.fn().mockRejectedValue(new Error("must not be called"));
    const deps = callbackDeps({
      exchangeCode: rejectedAuthCall,
      verifyToken: rejectedAuthCall,
      getVerifiedUser: rejectedAuthCall,
    });

    await expect(completeAuthCallback(parameters, deps)).resolves.toBe(INVALID_LINK);
    expect(rejectedAuthCall).not.toHaveBeenCalled();
  });

  it("bootstraps only the configured initial administrator", async () => {
    const deps = callbackDeps({
      getVerifiedUser: vi.fn().mockResolvedValue({ ...verifiedUser, email: "owner@example.com" }),
      bootstrapWorkspace: vi.fn().mockResolvedValue(true),
      acceptPendingInvitation: vi.fn().mockResolvedValue(false),
      hasMembership: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });

    await expect(completeAuthCallback({ code: "code" }, deps)).resolves.toBe("/");
    expect(deps.bootstrapWorkspace).toHaveBeenCalledWith("user-id", "owner@example.com");
    expect(deps.acceptPendingInvitation).not.toHaveBeenCalled();
  });

  it("does not bootstrap an arbitrary email address", async () => {
    const deps = callbackDeps({
      bootstrapWorkspace: vi.fn().mockResolvedValue(false),
      acceptPendingInvitation: vi.fn().mockResolvedValue(true),
      hasMembership: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });

    await expect(completeAuthCallback({ code: "code" }, deps)).resolves.toBe("/");
    expect(deps.bootstrapWorkspace).not.toHaveBeenCalled();
    expect(deps.acceptPendingInvitation).toHaveBeenCalledOnce();
  });

  it("accepts an invited user only after a final membership recheck", async () => {
    const hasMembership = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const deps = callbackDeps({ hasMembership });

    await expect(completeAuthCallback({ tokenHash: "token", type: "invite" }, deps)).resolves.toBe("/");
    expect(hasMembership).toHaveBeenCalledTimes(2);
  });

  it("verifies email token hashes used by scanner-safe login links", async () => {
    const deps = callbackDeps({ hasMembership: vi.fn().mockResolvedValue(true) });

    await expect(
      completeAuthCallback({ tokenHash: "token", type: "email" }, deps),
    ).resolves.toBe("/");
    expect(deps.verifyToken).toHaveBeenCalledWith("token", "email");
  });

  it("rejects acceptance when the final membership check still fails", async () => {
    const deps = callbackDeps({
      hasMembership: vi.fn().mockResolvedValue(false),
      acceptPendingInvitation: vi.fn().mockResolvedValue(true),
    });

    await expect(completeAuthCallback({ code: "code" }, deps)).resolves.toBe(INVALID_LINK);
  });

  it("returns members directly without attempting acceptance or bootstrap", async () => {
    const deps = callbackDeps({
      hasMembership: vi.fn().mockResolvedValue(true),
      acceptPendingInvitation: vi.fn().mockRejectedValue(new Error("must not be called")),
      bootstrapWorkspace: vi.fn().mockRejectedValue(new Error("must not be called")),
    });

    await expect(completeAuthCallback({ code: "code" }, deps)).resolves.toBe("/");
  });

  it("rejects an unverified user before membership resolution", async () => {
    const deps = callbackDeps({
      getVerifiedUser: vi.fn().mockResolvedValue({ ...verifiedUser, emailConfirmedAt: null }),
      hasMembership: vi.fn().mockRejectedValue(new Error("must not be called")),
    });

    await expect(completeAuthCallback({ code: "code" }, deps)).resolves.toBe(INVALID_LINK);
  });
});
