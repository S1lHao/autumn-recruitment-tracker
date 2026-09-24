import { describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  requireMember: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: queryMocks.createServerClient,
}));

vi.mock("@/features/auth/authorization", () => ({
  requireMember: queryMocks.requireMember,
}));

import {
  listApplications,
  listApplicationsWithDeps,
  listSharedCompaniesWithDeps,
  listWorkspaceMembersWithDeps,
  mapApplicationRow,
  hasActiveEditAccess,
  hasActiveEditAccessWithDeps,
  summarizeApplications,
} from "./queries";
import type { Application } from "./types";

const applications: Application[] = [
  { id: "a", workspaceId: "w", ownerId: "u", company: "A", role: "r", location: "", stage: "面试", appliedOn: null, nextStep: "安排终面", deadline: null, jobUrl: null, notes: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "b", workspaceId: "w", ownerId: "u", company: "B", role: "r", location: "", stage: "已投递", appliedOn: null, nextStep: "", deadline: null, jobUrl: null, notes: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "c", workspaceId: "w", ownerId: "u", company: "C", role: "r", location: "", stage: "Offer", appliedOn: null, nextStep: "签约", deadline: null, jobUrl: null, notes: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "d", workspaceId: "w", ownerId: "u", company: "D", role: "r", location: "", stage: "待测评", appliedOn: null, nextStep: "", deadline: null, jobUrl: null, notes: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "e", workspaceId: "w", ownerId: "u", company: "E", role: "r", location: "", stage: "待笔试", appliedOn: null, nextStep: "", deadline: null, jobUrl: null, notes: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "f", workspaceId: "w", ownerId: "u", company: " a ", role: "another role", location: "", stage: "已投递", appliedOn: null, nextStep: "", deadline: null, jobUrl: null, notes: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
];

type QueryCall =
  | { method: "from"; table: string }
  | { method: "select"; table: string; columns: string }
  | { method: "eq"; table: string; column: string; value: string }
  | { method: "is"; table: string; column: string; value: null }
  | { method: "gt"; table: string; column: string; value: string }
  | { method: "order"; table: string; column: string; options: { ascending: boolean; nullsFirst?: boolean } };

function sessionClient(options: { member: unknown; applications: unknown; grants?: unknown }) {
  const calls: QueryCall[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", table });
        const result = table === "workspace_members" ? options.member : table === "applications" ? options.applications : options.grants;
        const builder = {
          select(columns: string) {
            calls.push({ method: "select", table, columns });
            return builder;
          },
          eq(column: string, value: string) {
            calls.push({ method: "eq", table, column, value });
            return builder;
          },
          is(column: string, value: null) {
            calls.push({ method: "is", table, column, value });
            return builder;
          },
          gt(column: string, value: string) {
            calls.push({ method: "gt", table, column, value });
            return builder;
          },
          order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
            calls.push({ method: "order", table, column, options });
            return builder;
          },
          maybeSingle: async () => result,
          then: <TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) => Promise.resolve(result).then(onfulfilled, onrejected),
        };
        return builder;
      },
    },
  };
}

describe("application queries", () => {
  it("counts unique companies in total and only assessment and written-test stages as pending", () => {
    expect(summarizeApplications(applications)).toEqual({ total: 5, interviewing: 1, pending: 2, offers: 1 });
  });

  it("maps database rows without changing timestamps or nullable fields", () => {
    expect(mapApplicationRow({
      id: "application", workspace_id: "workspace", owner_id: "owner", company: "Example", role: "Engineer", location: "", stage: "已投递", applied_on: null, next_step: "", deadline: "2026-09-04T09:30:00+08:00", job_url: null, notes: "", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z",
    })).toMatchObject({ workspaceId: "workspace", ownerId: "owner", appliedOn: null, deadline: "2026-09-04T09:30:00+08:00", jobUrl: null });
  });

  it("uses scoped dependencies and returns safe query errors", async () => {
    const listMembers = vi.fn().mockResolvedValue({ data: [{ id: "u", email: "u@example.com", displayName: "U", role: "member" }], error: null });
    const listApplications = vi.fn().mockResolvedValue({ data: [], error: null });
    const member = { userId: "u", workspaceId: "workspace", email: "u@example.com", role: "member" as const };
    await expect(listWorkspaceMembersWithDeps({ currentMember: async () => member, listMembers })).resolves.toEqual({ ok: true, data: [{ id: "u", email: "u@example.com", displayName: "U", role: "member" }] });
    await expect(listApplicationsWithDeps(undefined, { currentMember: async () => member, findMember: async () => ({ data: { id: "u" }, error: null }), listApplications })).resolves.toEqual({ ok: true, data: [] });
    expect(listMembers).toHaveBeenCalledWith("workspace");
    expect(listApplications).toHaveBeenCalledWith({ workspaceId: "workspace", ownerId: "u" });
    await expect(listApplicationsWithDeps(undefined, { currentMember: async () => member, findMember: async () => ({ data: { id: "u" }, error: null }), listApplications: async () => ({ data: null, error: new Error("raw db failure") }) })).resolves.toEqual({ ok: false, message: "申请记录加载失败，请稍后重试" });
  });

  it("lists only the current workspace shared company catalog", async () => {
    const listCompanies = vi.fn().mockResolvedValue({ data: [{ id: "company", name: "Example", website: "https://example.com" }], error: null });
    const member = { userId: "u", workspaceId: "workspace", email: "u@example.com", role: "member" as const };
    await expect(listSharedCompaniesWithDeps({ currentMember: async () => member, listCompanies })).resolves.toEqual({
      ok: true,
      data: [{ id: "company", name: "Example", website: "https://example.com" }],
    });
    expect(listCompanies).toHaveBeenCalledWith("workspace");
  });

  it("distinguishes allowed, denied, and failed edit-access lookups", async () => {
    const findActiveGrant = vi.fn().mockResolvedValue({ data: { id: "grant" }, error: null });
    await expect(hasActiveEditAccessWithDeps("workspace", "owner", "owner", { findActiveGrant })).resolves.toEqual({ ok: true, allowed: true });
    expect(findActiveGrant).not.toHaveBeenCalled();
    await expect(hasActiveEditAccessWithDeps("workspace", "owner", "grantee", { findActiveGrant })).resolves.toEqual({ ok: true, allowed: true });
    expect(findActiveGrant).toHaveBeenCalledWith({ workspaceId: "workspace", ownerId: "owner", granteeId: "grantee", now: expect.any(String) });
    await expect(hasActiveEditAccessWithDeps("workspace", "owner", "grantee", { findActiveGrant: async () => ({ data: null, error: null }) })).resolves.toEqual({ ok: true, allowed: false });
    await expect(hasActiveEditAccessWithDeps("workspace", "owner", "grantee", { findActiveGrant: async () => ({ data: null, error: new Error("db") }) })).resolves.toEqual({ ok: false });
    await expect(hasActiveEditAccessWithDeps("workspace", "owner", "grantee", { findActiveGrant: async () => { throw new Error("network"); } })).resolves.toEqual({ ok: false });
  });

  it("queries only an active exact edit grant through the authenticated session client", async () => {
    const fake = sessionClient({ member: { data: null, error: null }, applications: { data: [], error: null }, grants: { data: { id: "grant" }, error: null } });
    queryMocks.createServerClient.mockResolvedValue(fake.client);
    await expect(hasActiveEditAccess("workspace", "owner", "grantee", new Date("2026-09-07T00:00:00.000Z"))).resolves.toEqual({ ok: true, allowed: true });
    expect(fake.calls).toEqual([
      { method: "from", table: "edit_grants" },
      { method: "select", table: "edit_grants", columns: "id" },
      { method: "eq", table: "edit_grants", column: "workspace_id", value: "workspace" },
      { method: "eq", table: "edit_grants", column: "owner_id", value: "owner" },
      { method: "eq", table: "edit_grants", column: "grantee_id", value: "grantee" },
      { method: "is", table: "edit_grants", column: "revoked_at", value: null },
      { method: "gt", table: "edit_grants", column: "expires_at", value: "2026-09-07T00:00:00.000Z" },
    ]);
  });

  it("builds a current-member query with approved fields and the required ordering", async () => {
    const fake = sessionClient({
      member: { data: { user_id: "owner" }, error: null },
      applications: { data: [{ id: "application", workspace_id: "workspace", owner_id: "owner", company: "Example", role: "Engineer", location: "", stage: "已投递", applied_on: null, next_step: "", deadline: null, job_url: null, notes: "", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }], error: null },
    });
    queryMocks.requireMember.mockResolvedValue({ userId: "owner", workspaceId: "workspace", email: "owner@example.com", role: "member" });
    queryMocks.createServerClient.mockResolvedValue(fake.client);

    await expect(listApplications()).resolves.toEqual({ ok: true, data: [expect.objectContaining({ id: "application", workspaceId: "workspace", ownerId: "owner" })] });
    expect(fake.calls).toEqual([
      { method: "from", table: "workspace_members" },
      { method: "select", table: "workspace_members", columns: "user_id" },
      { method: "eq", table: "workspace_members", column: "workspace_id", value: "workspace" },
      { method: "eq", table: "workspace_members", column: "user_id", value: "owner" },
      { method: "from", table: "applications" },
      { method: "select", table: "applications", columns: "id, workspace_id, owner_id, company, role, location, stage, applied_on, next_step, deadline, job_url, notes, created_at, updated_at" },
      { method: "eq", table: "applications", column: "workspace_id", value: "workspace" },
      { method: "eq", table: "applications", column: "owner_id", value: "owner" },
      { method: "order", table: "applications", column: "deadline", options: { ascending: true, nullsFirst: false } },
      { method: "order", table: "applications", column: "updated_at", options: { ascending: false } },
    ]);
  });

  it("checks a requested owner before any application select and never exposes outsider existence", async () => {
    const fake = sessionClient({ member: { data: null, error: null }, applications: { data: [], error: null } });
    queryMocks.requireMember.mockResolvedValue({ userId: "owner", workspaceId: "workspace", email: "owner@example.com", role: "member" });
    queryMocks.createServerClient.mockResolvedValue(fake.client);

    await expect(listApplications("outside")).resolves.toEqual({ ok: false, message: "无法访问该成员的申请记录" });
    expect(fake.calls).toEqual([
      { method: "from", table: "workspace_members" },
      { method: "select", table: "workspace_members", columns: "user_id" },
      { method: "eq", table: "workspace_members", column: "workspace_id", value: "workspace" },
      { method: "eq", table: "workspace_members", column: "user_id", value: "outside" },
    ]);
  });
});
