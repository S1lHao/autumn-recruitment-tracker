"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireMember, type CurrentMember } from "@/features/auth/authorization";
import type { ActionResult } from "@/features/shared/result";
import { parseApplicationInput } from "./schemas";
import type { ApplicationInput, WorkspaceMember } from "./types";
import { hasActiveEditAccess } from "./queries";
import type { EditAccessResult } from "./queries";

type ApplicationIdentity = { id: string; workspaceId: string; ownerId: string };
type OperationResult = { error: unknown | null; data: { id: string }[] | null };
type CompanyInput = { workspaceId: string; name: string; website: string | null };

export type ApplicationActionDependencies = {
  currentMember: () => Promise<CurrentMember>;
  findWorkspaceMember: (workspaceId: string, userId: string) => Promise<WorkspaceMember | null>;
  findApplication: (applicationId: string, workspaceId: string) => Promise<ApplicationIdentity | null>;
  canEditOwner: (workspaceId: string, ownerId: string, actorId: string) => Promise<EditAccessResult>;
  checkWorkspaceMembership: (workspaceId: string, userId: string) => Promise<EditAccessResult>;
  ensureCompany: (input: CompanyInput) => Promise<OperationResult>;
  create: (input: ApplicationInput & { workspaceId: string; ownerId: string }) => Promise<OperationResult>;
  update: (application: ApplicationIdentity, input: ApplicationInput) => Promise<OperationResult>;
  remove: (application: ApplicationIdentity) => Promise<OperationResult>;
  revalidate: (path: string) => void;
};

function formLikeToObject(value: unknown): unknown {
  if (value instanceof FormData) return Object.fromEntries(value.entries());
  return value;
}

function requestedOwnerId(value: unknown): string | null {
  const input = formLikeToObject(value);
  if (!input || typeof input !== "object" || !("ownerId" in input)) return null;
  const ownerId = input.ownerId;
  return typeof ownerId === "string" && ownerId.trim() !== "" ? ownerId.trim() : null;
}

function validationResult(
  value: unknown,
): Extract<ActionResult, { ok: false }> | null {
  const parsed = parseApplicationInput(formLikeToObject(value));
  if (parsed.success) return null;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, message: "请检查申请信息", fieldErrors };
}

function parsedInput(value: unknown): ApplicationInput | null {
  const parsed = parseApplicationInput(formLikeToObject(value));
  return parsed.success ? parsed.data : null;
}

async function selectWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("workspace_members")
    .select("user_id, role, profiles!inner(email, display_name)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (response.error || !response.data) return null;
  const row = response.data as unknown as { user_id: string; role: "admin" | "member"; profiles: { email: string; display_name: string } | null };
  if (!row.profiles) return null;
  return { id: row.user_id, role: row.role, email: row.profiles.email, displayName: row.profiles.display_name };
}

async function selectApplication(applicationId: string, workspaceId: string): Promise<ApplicationIdentity | null> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("applications")
    .select("id, workspace_id, owner_id")
    .eq("id", applicationId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (response.error || !response.data) return null;
  const row = response.data as unknown as { id: string; workspace_id: string; owner_id: string };
  return { id: row.id, workspaceId: row.workspace_id, ownerId: row.owner_id };
}

async function checkWorkspaceMembership(workspaceId: string, userId: string): Promise<EditAccessResult> {
  try {
    const supabase = await createServerClient();
    const response = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (response.error) return { ok: false };
    return { ok: true, allowed: Boolean(response.data) };
  } catch {
    return { ok: false };
  }
}

function sessionDependencies(): ApplicationActionDependencies {
  return {
    currentMember: requireMember,
    findWorkspaceMember: selectWorkspaceMember,
    findApplication: selectApplication,
    canEditOwner: hasActiveEditAccess,
    checkWorkspaceMembership,
    async ensureCompany(input) {
      const supabase = await createServerClient();
      const response = await supabase.rpc("upsert_workspace_company", {
        target_workspace_id: input.workspaceId,
        company_name: input.name,
        company_website: input.website,
      });
      return {
        error: response.error,
        data: typeof response.data === "string" ? [{ id: response.data }] : null,
      };
    },
    async create(input) {
      const supabase = await createServerClient();
      const { workspaceId, ownerId, ...fields } = input;
      const response = await supabase
        .from("applications")
        .insert({
          workspace_id: workspaceId,
          owner_id: ownerId,
          company: fields.company,
          role: fields.role,
          location: fields.location,
          stage: fields.stage,
          applied_on: fields.appliedOn,
          next_step: fields.nextStep,
          deadline: fields.deadline,
          notes: fields.notes,
        })
        .select("id");
      return { error: response.error, data: response.data as unknown as { id: string }[] | null };
    },
    async update(application, input) {
      const supabase = await createServerClient();
      const response = await supabase
        .from("applications")
        .update({
          company: input.company,
          role: input.role,
          location: input.location,
          stage: input.stage,
          applied_on: input.appliedOn,
          next_step: input.nextStep,
          deadline: input.deadline,
          notes: input.notes,
        })
        .eq("id", application.id)
        .eq("workspace_id", application.workspaceId)
        .eq("owner_id", application.ownerId)
        .select("id");
      return { error: response.error, data: response.data as unknown as { id: string }[] | null };
    },
    async remove(application) {
      const supabase = await createServerClient();
      const response = await supabase
        .from("applications")
        .delete()
        .eq("id", application.id)
        .eq("workspace_id", application.workspaceId)
        .eq("owner_id", application.ownerId)
        .select("id");
      return { error: response.error, data: response.data as unknown as { id: string }[] | null };
    },
    revalidate: revalidatePath,
  };
}

function affectedExactlyOne(response: OperationResult, expectedId?: string) {
  return (
    !response.error &&
    response.data?.length === 1 &&
    response.data[0]?.id !== "" &&
    (expectedId === undefined || response.data[0]?.id === expectedId)
  );
}

function permissionDenied(): ActionResult {
  return { ok: false, message: "你没有编辑该成员记录的权限", code: "PERMISSION_DENIED" };
}

function permissionCheckFailed(): ActionResult {
  return { ok: false, message: "编辑权限检查失败，请稍后重试" };
}

async function writeFailureResult(
  dependencies: Pick<ApplicationActionDependencies, "canEditOwner">,
  workspaceId: string,
  ownerId: string,
  actorId: string,
  fallbackMessage: string,
): Promise<ActionResult> {
  const access = await checkEditAccess(dependencies, workspaceId, ownerId, actorId);
  return access.ok && !access.allowed ? permissionDenied() : { ok: false, message: fallbackMessage };
}

async function deleteFailureResult(
  dependencies: Pick<ApplicationActionDependencies, "checkWorkspaceMembership">,
  workspaceId: string,
  actorId: string,
): Promise<ActionResult> {
  try {
    const membership = await dependencies.checkWorkspaceMembership(workspaceId, actorId);
    return membership.ok && !membership.allowed
      ? permissionDenied()
      : { ok: false, message: "申请记录删除失败，请稍后重试" };
  } catch {
    return { ok: false, message: "申请记录删除失败，请稍后重试" };
  }
}

export async function createApplicationWithDeps(value: unknown, dependencies: ApplicationActionDependencies): Promise<ActionResult> {
  const invalid = validationResult(value);
  if (invalid) return invalid;
  const input = parsedInput(value);
  if (!input) return { ok: false, message: "请检查申请信息" };
  const member = await dependencies.currentMember();
  const ownerId = requestedOwnerId(value) ?? member.userId;
  const target = await dependencies.findWorkspaceMember(member.workspaceId, ownerId);
  if (!target) return { ok: false, message: "目标成员不在当前工作区" };
  const access = await checkEditAccess(dependencies, member.workspaceId, ownerId, member.userId);
  if (!access.ok) return permissionCheckFailed();
  if (!access.allowed) return permissionDenied();
  try {
    const companyResponse = await dependencies.ensureCompany({
      workspaceId: member.workspaceId,
      name: input.company,
      website: input.companyWebsite,
    });
    if (!affectedExactlyOne(companyResponse)) {
      return { ok: false, message: "公司信息保存失败，请稍后重试" };
    }
    const response = await dependencies.create({ ...input, workspaceId: member.workspaceId, ownerId });
    if (!affectedExactlyOne(response)) {
      return writeFailureResult(dependencies, member.workspaceId, ownerId, member.userId, "申请记录保存失败，请稍后重试");
    }
  } catch {
    return writeFailureResult(dependencies, member.workspaceId, ownerId, member.userId, "申请记录保存失败，请稍后重试");
  }
  dependencies.revalidate("/");
  return { ok: true };
}

export async function updateApplicationWithDeps(applicationId: string, value: unknown, dependencies: ApplicationActionDependencies): Promise<ActionResult> {
  const invalid = validationResult(value);
  if (invalid) return invalid;
  const input = parsedInput(value);
  if (!input) return { ok: false, message: "请检查申请信息" };
  const member = await dependencies.currentMember();
  const application = await dependencies.findApplication(applicationId, member.workspaceId);
  if (!application) return { ok: false, message: "申请记录不存在或无权访问" };
  const owner = await dependencies.findWorkspaceMember(member.workspaceId, application.ownerId);
  if (!owner) return { ok: false, message: "目标成员不在当前工作区" };
  const access = await checkEditAccess(dependencies, member.workspaceId, application.ownerId, member.userId);
  if (!access.ok) return permissionCheckFailed();
  if (!access.allowed) return permissionDenied();
  try {
    const companyResponse = await dependencies.ensureCompany({
      workspaceId: member.workspaceId,
      name: input.company,
      website: input.companyWebsite,
    });
    if (!affectedExactlyOne(companyResponse)) {
      return { ok: false, message: "公司信息保存失败，请稍后重试" };
    }
    const response = await dependencies.update(application, input);
    if (!affectedExactlyOne(response, application.id)) {
      return writeFailureResult(dependencies, member.workspaceId, application.ownerId, member.userId, "申请记录保存失败，请稍后重试");
    }
  } catch {
    return writeFailureResult(dependencies, member.workspaceId, application.ownerId, member.userId, "申请记录保存失败，请稍后重试");
  }
  dependencies.revalidate("/");
  return { ok: true };
}

async function checkEditAccess(
  dependencies: Pick<ApplicationActionDependencies, "canEditOwner">,
  workspaceId: string,
  ownerId: string,
  actorId: string,
): Promise<EditAccessResult> {
  try {
    return await dependencies.canEditOwner(workspaceId, ownerId, actorId);
  } catch {
    return { ok: false };
  }
}

export async function deleteApplicationWithDeps(applicationId: string, dependencies: ApplicationActionDependencies): Promise<ActionResult> {
  const member = await dependencies.currentMember();
  const application = await dependencies.findApplication(applicationId, member.workspaceId);
  if (!application) return { ok: false, message: "申请记录不存在或无权访问" };
  if (application.ownerId !== member.userId) return { ok: false, message: "只能删除自己的申请记录", code: "PERMISSION_DENIED" };
  try {
    const response = await dependencies.remove(application);
    if (!affectedExactlyOne(response, application.id)) {
      return deleteFailureResult(dependencies, member.workspaceId, member.userId);
    }
  } catch {
    return deleteFailureResult(dependencies, member.workspaceId, member.userId);
  }
  dependencies.revalidate("/");
  return { ok: true };
}

export async function createApplication(value: unknown): Promise<ActionResult> {
  return createApplicationWithDeps(value, sessionDependencies());
}

export async function updateApplication(applicationId: string, value: unknown): Promise<ActionResult> {
  return updateApplicationWithDeps(applicationId, value, sessionDependencies());
}

export async function deleteApplication(applicationId: string): Promise<ActionResult> {
  return deleteApplicationWithDeps(applicationId, sessionDependencies());
}
