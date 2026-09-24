import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  listApplications: vi.fn(),
  listSharedCompanies: vi.fn(),
  hasActiveEditAccess: vi.fn(),
  listOwnedActiveGrants: vi.fn(),
}));
vi.mock("@/features/auth/authorization", () => ({ requireMember: pageMocks.requireMember }));
vi.mock("@/features/applications/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/applications/queries")>()),
  listWorkspaceMembers: pageMocks.listWorkspaceMembers,
  listApplications: pageMocks.listApplications,
  listSharedCompanies: pageMocks.listSharedCompanies,
  hasActiveEditAccess: pageMocks.hasActiveEditAccess,
}));
vi.mock("@/features/grants/queries", () => ({ listOwnedActiveGrants: pageMocks.listOwnedActiveGrants }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), redirect: vi.fn() }));
import Page from "./page";

beforeEach(() => {
  pageMocks.listOwnedActiveGrants.mockResolvedValue({ ok: true, data: [] });
  pageMocks.listSharedCompanies.mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

it("loads only a validated selected member and renders the authenticated workspace", async () => {
  const current = { userId: "11111111-1111-4111-8111-111111111111", workspaceId: "w", email: "me@example.com", role: "member" as const };
  pageMocks.requireMember.mockResolvedValue(current);
  pageMocks.listWorkspaceMembers.mockResolvedValue({ ok: true, data: [{ id: current.userId, email: current.email, displayName: "我", role: "member" }] });
  pageMocks.listApplications.mockResolvedValue({ ok: true, data: [] });

  render(await Page({ searchParams: Promise.resolve({ member: "outsider" }) }));
  expect(pageMocks.listApplications).toHaveBeenCalledWith(current.userId);
  expect(screen.getByRole("heading", { level: 1, name: "秋招协作台" })).toBeInTheDocument();
  expect(screen.getByText("me@example.com")).toBeInTheDocument();
  expect(pageMocks.listOwnedActiveGrants).toHaveBeenCalledWith(expect.any(Date));
});

it("uses an active teammate grant to render temporary edit access", async () => {
  const current = { userId: "11111111-1111-4111-8111-111111111111", workspaceId: "w", email: "me@example.com", role: "member" as const };
  const teammate = { id: "22222222-2222-4222-8222-222222222222", email: "teammate@example.com", displayName: "同事", role: "member" as const };
  pageMocks.requireMember.mockResolvedValue(current);
  pageMocks.listWorkspaceMembers.mockResolvedValue({ ok: true, data: [{ id: current.userId, email: current.email, displayName: "我", role: "member" }, teammate] });
  pageMocks.listApplications.mockResolvedValue({ ok: true, data: [] });
  pageMocks.hasActiveEditAccess.mockResolvedValue({ ok: true, allowed: true });

  render(await Page({ searchParams: Promise.resolve({ member: teammate.id }) }));
  expect(pageMocks.hasActiveEditAccess).toHaveBeenCalledWith("w", teammate.id, current.userId);
  expect(pageMocks.listOwnedActiveGrants).not.toHaveBeenCalled();
  expect(screen.getByText("临时可编辑：授权到期前可以新增和修改记录")).toBeInTheDocument();
});

it("surfaces an edit-permission lookup failure instead of treating it as a confirmed denial", async () => {
  const current = { userId: "11111111-1111-4111-8111-111111111111", workspaceId: "w", email: "me@example.com", role: "member" as const };
  const teammate = { id: "22222222-2222-4222-8222-222222222222", email: "teammate@example.com", displayName: "同事", role: "member" as const };
  pageMocks.requireMember.mockResolvedValue(current);
  pageMocks.listWorkspaceMembers.mockResolvedValue({ ok: true, data: [{ id: current.userId, email: current.email, displayName: "我", role: "member" }, teammate] });
  pageMocks.listApplications.mockResolvedValue({ ok: true, data: [] });
  pageMocks.hasActiveEditAccess.mockResolvedValue({ ok: false });

  render(await Page({ searchParams: Promise.resolve({ member: teammate.id }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("编辑权限加载失败，请刷新后重试");
});

it("serializes a deadline into the same Beijing-time inline value across hydration", async () => {
  vi.useFakeTimers();
  const serverNow = new Date("2026-09-07T12:00:00.000Z");
  vi.setSystemTime(serverNow);
  const current = { userId: "11111111-1111-4111-8111-111111111111", workspaceId: "w", email: "me@example.com", role: "member" as const };
  pageMocks.requireMember.mockResolvedValue(current);
  pageMocks.listWorkspaceMembers.mockResolvedValue({ ok: true, data: [{ id: current.userId, email: current.email, displayName: "我", role: "member" }] });
  pageMocks.listApplications.mockResolvedValue({ ok: true, data: [{
    id: "application", workspaceId: "w", ownerId: current.userId, company: "边界公司", role: "工程师", location: "", stage: "待投递",
    appliedOn: null, nextStep: "", deadline: serverNow.toISOString(), jobUrl: null, notes: "", createdAt: serverNow.toISOString(), updatedAt: serverNow.toISOString(),
  }] });

  const page = await Page({ searchParams: Promise.resolve({}) });
  vi.setSystemTime(new Date(serverNow.getTime() + 1));
  render(page);

  expect(screen.getByLabelText("更新 边界公司 工程师 截止时间")).toHaveValue("2026-09-07T20:00");
});
