import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
  parseServerEnv: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/env", () => ({
  parseServerEnv: mocks.parseServerEnv,
}));

import { GET, POST } from "./route";

function membershipQuery(results: Array<{ data: unknown[]; error: null }>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(results.shift() ?? { data: [], error: null })),
      })),
    })),
  };
}

function configuredUser(emailConfirmedAt: string | null = "2026-09-04T08:00:00.000Z") {
  return {
    data: {
      user: {
        id: "user-id",
        email: "invitee@example.com",
        email_confirmed_at: emailConfirmedAt,
      },
    },
    error: null,
  };
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.parseServerEnv.mockReturnValue({ INITIAL_ADMIN_EMAIL: "owner@example.com" });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue(configuredUser());
    mocks.from.mockImplementation(() => membershipQuery([{ data: [{ workspace_id: "workspace-id" }], error: null }]));
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        verifyOtp: mocks.verifyOtp,
        getUser: mocks.getUser,
      },
      from: mocks.from,
      rpc: mocks.rpc,
    });
    mocks.createAdminClient.mockReturnValue({ rpc: vi.fn() });
  });

  it("exchanges code callbacks and keeps redirects fixed to the local root", async () => {
    const response = await GET(
      new Request("https://tracker.example.com/auth/callback?code=code-value&next=https://evil.example"),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("code-value");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://tracker.example.com/");
  });

  it("verifies Supabase invite token callbacks instead of exchanging a code", async () => {
    const response = await GET(
      new Request("https://tracker.example.com/auth/callback?token_hash=hash-value&type=invite"),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-value", type: "invite" });
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://tracker.example.com/");
  });

  it("verifies scanner-safe email tokens submitted by the confirmation page", async () => {
    const response = await POST(
      new Request("https://tracker.example.com/auth/callback", {
        method: "POST",
        body: new URLSearchParams({ token_hash: "hash-value", type: "email" }),
      }),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-value", type: "email" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://tracker.example.com/");
  });

  it("rejects unconfirmed users before membership lookup", async () => {
    mocks.getUser.mockResolvedValue(configuredUser(null));

    const response = await GET(new Request("https://tracker.example.com/auth/callback?code=code-value"));

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://tracker.example.com/login?error=invalid_link",
    );
  });

  it("uses a fixed invalid-link redirect when invitation acceptance fails", async () => {
    mocks.from.mockImplementation(() => membershipQuery([{ data: [], error: null }]));
    mocks.rpc.mockResolvedValue({ error: { message: "internal provider detail" } });

    const response = await GET(new Request("https://tracker.example.com/auth/callback?code=code-value"));

    expect(mocks.rpc).toHaveBeenCalledWith("accept_pending_invitation");
    expect(response.headers.get("location")).toBe(
      "https://tracker.example.com/login?error=invalid_link",
    );
  });
});
