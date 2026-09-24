import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { requireMember, type CurrentMember } from "@/features/auth/authorization";
import type { Application, ApplicationStage, SharedCompany, WorkspaceMember } from "./types";
export { summarizeApplications } from "./summarize-applications";

const APPLICATION_COLUMNS =
  "id, workspace_id, owner_id, company, role, location, stage, applied_on, next_step, deadline, job_url, notes, created_at, updated_at";

type ApplicationRow = {
  id: string;
  workspace_id: string;
  owner_id: string;
  company: string;
  role: string;
  location: string;
  stage: ApplicationStage;
  applied_on: string | null;
  next_step: string;
  deadline: string | null;
  job_url: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  user_id: string;
  role: "admin" | "member";
  profiles: { email: string; display_name: string } | null;
};

type QueryResponse<T> = { data: T | null; error: unknown | null };
type TargetMember = { id: string };
type ActiveGrant = { id: string };
type ActiveGrantLookup = { workspaceId: string; ownerId: string; granteeId: string; now: string };
type CompanyRow = { id: string; name: string; website: string | null };

export type EditAccessDependencies = {
  findActiveGrant: (input: ActiveGrantLookup) => Promise<QueryResponse<ActiveGrant>>;
};

export type EditAccessResult =
  | { ok: true; allowed: boolean }
  | { ok: false };

export type ApplicationQueryDependencies = {
  currentMember: () => Promise<CurrentMember>;
  listMembers: (workspaceId: string) => Promise<QueryResponse<WorkspaceMember[]>>;
  findMember: (workspaceId: string, userId: string) => Promise<QueryResponse<TargetMember>>;
  listApplications: (scope: { workspaceId: string; ownerId: string }) => Promise<QueryResponse<ApplicationRow[]>>;
};

export type SharedCompanyQueryDependencies = {
  currentMember: () => Promise<CurrentMember>;
  listCompanies: (workspaceId: string) => Promise<QueryResponse<CompanyRow[]>>;
};

export function mapApplicationRow(row: ApplicationRow): Application {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerId: row.owner_id,
    company: row.company,
    role: row.role,
    location: row.location,
    stage: row.stage,
    appliedOn: row.applied_on,
    nextStep: row.next_step,
    deadline: row.deadline,
    jobUrl: row.job_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function hasActiveEditAccessWithDeps(
  workspaceId: string,
  ownerId: string,
  granteeId: string,
  dependencies: EditAccessDependencies,
  now: Date = new Date(),
): Promise<EditAccessResult> {
  if (ownerId === granteeId) return { ok: true, allowed: true };
  try {
    const response = await dependencies.findActiveGrant({ workspaceId, ownerId, granteeId, now: now.toISOString() });
    if (response.error) return { ok: false };
    return { ok: true, allowed: Boolean(response.data) };
  } catch {
    return { ok: false };
  }
}

export async function listWorkspaceMembersWithDeps(
  dependencies: Pick<ApplicationQueryDependencies, "currentMember" | "listMembers">,
): Promise<{ ok: true; data: WorkspaceMember[] } | { ok: false; message: string }> {
  const member = await dependencies.currentMember();
  try {
    const response = await dependencies.listMembers(member.workspaceId);
    if (response.error || !response.data) throw new Error("workspace_members_query_failed");
    return { ok: true, data: response.data };
  } catch {
    return { ok: false, message: "成员列表加载失败，请稍后重试" };
  }
}

export async function listSharedCompaniesWithDeps(
  dependencies: SharedCompanyQueryDependencies,
): Promise<{ ok: true; data: SharedCompany[] } | { ok: false; message: string }> {
  const member = await dependencies.currentMember();
  try {
    const response = await dependencies.listCompanies(member.workspaceId);
    if (response.error || !response.data) throw new Error("companies_query_failed");
    return { ok: true, data: response.data.map((row) => ({ id: row.id, name: row.name, website: row.website })) };
  } catch {
    return { ok: false, message: "共享公司库暂时无法加载，你仍可手动输入公司" };
  }
}

export async function listApplicationsWithDeps(
  requestedOwnerId: string | undefined,
  dependencies: Pick<
    ApplicationQueryDependencies,
    "currentMember" | "findMember" | "listApplications"
  >,
): Promise<{ ok: true; data: Application[] } | { ok: false; message: string }> {
  const member = await dependencies.currentMember();
  const ownerId = requestedOwnerId ?? member.userId;
  try {
    const target = await dependencies.findMember(member.workspaceId, ownerId);
    if (target.error || !target.data) {
      return { ok: false, message: "无法访问该成员的申请记录" };
    }
    const response = await dependencies.listApplications({
      workspaceId: member.workspaceId,
      ownerId: target.data.id,
    });
    if (response.error || !response.data) throw new Error("applications_query_failed");
    return { ok: true, data: response.data.map(mapApplicationRow) };
  } catch {
    return { ok: false, message: "申请记录加载失败，请稍后重试" };
  }
}

async function sessionFindMember(
  workspaceId: string,
  userId: string,
): Promise<QueryResponse<TargetMember>> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (response.error || !response.data) return { data: null, error: response.error };
  const row = response.data as unknown as { user_id: string };
  return { data: { id: row.user_id }, error: null };
}

async function sessionListMembers(workspaceId: string): Promise<QueryResponse<WorkspaceMember[]>> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("workspace_members")
    .select("user_id, role, profiles!inner(email, display_name)")
    .eq("workspace_id", workspaceId)
    .order("user_id", { ascending: true });
  if (response.error || !response.data) return { data: null, error: response.error };
  const data = (response.data as unknown as MemberRow[]).flatMap((row) =>
    row.profiles
      ? [{ id: row.user_id, email: row.profiles.email, displayName: row.profiles.display_name, role: row.role }]
      : [],
  );
  return { data, error: null };
}

async function sessionListApplications(scope: { workspaceId: string; ownerId: string }): Promise<QueryResponse<ApplicationRow[]>> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("workspace_id", scope.workspaceId)
    .eq("owner_id", scope.ownerId)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });
  return { data: response.data as unknown as ApplicationRow[] | null, error: response.error };
}

async function sessionListCompanies(workspaceId: string): Promise<QueryResponse<CompanyRow[]>> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("companies")
    .select("id, name, website")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  return { data: response.data as unknown as CompanyRow[] | null, error: response.error };
}

async function sessionFindActiveGrant(input: ActiveGrantLookup): Promise<QueryResponse<ActiveGrant>> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("edit_grants")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("owner_id", input.ownerId)
    .eq("grantee_id", input.granteeId)
    .is("revoked_at", null)
    .gt("expires_at", input.now)
    .maybeSingle();
  return { data: response.data as ActiveGrant | null, error: response.error };
}

export async function hasActiveEditAccess(
  workspaceId: string,
  ownerId: string,
  granteeId: string,
  now: Date = new Date(),
): Promise<EditAccessResult> {
  return hasActiveEditAccessWithDeps(workspaceId, ownerId, granteeId, { findActiveGrant: sessionFindActiveGrant }, now);
}

export async function listWorkspaceMembers() {
  return listWorkspaceMembersWithDeps({ currentMember: requireMember, listMembers: sessionListMembers });
}

export async function listApplications(ownerId?: string) {
  return listApplicationsWithDeps(ownerId, {
    currentMember: requireMember,
    findMember: sessionFindMember,
    listApplications: sessionListApplications,
  });
}

export async function listSharedCompanies() {
  return listSharedCompaniesWithDeps({ currentMember: requireMember, listCompanies: sessionListCompanies });
}
