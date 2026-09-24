"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { requireMember, type CurrentMember } from "@/features/auth/authorization";
import type { ActionResult } from "@/features/shared/result";
import { createServerClient } from "@/lib/supabase/server";
import { parseGrantInput, revokeGrantInput, type EditGrant } from "./schemas";

type MemberLookup = { ok: true; found: boolean } | { ok: false };
type CreateGrantResult = { data: EditGrant | null; error: unknown | null };
type RevokeGrantResult = { data: { id: string } | null; error: unknown | null };

export type GrantActionDependencies = {
  currentMember: () => Promise<CurrentMember>;
  findWorkspaceMember: (workspaceId: string, userId: string) => Promise<MemberLookup>;
  createGrantAtomic: (input: {
    workspaceId: string;
    ownerId: string;
    granteeId: string;
    expiresAt: string;
  }) => Promise<CreateGrantResult>;
  revokeGrantAtomic: (input: {
    grantId: string;
    workspaceId: string;
    ownerId: string;
  }) => Promise<RevokeGrantResult>;
  now: () => Date;
  revalidate: (path: string) => void;
};

function validationFailure(message: string, field: string): ActionResult {
  return { ok: false, message, fieldErrors: { [field]: [message] } };
}

function isExactGrant(value: EditGrant | null, expected: Omit<EditGrant, "id">): value is EditGrant {
  return Boolean(
    value &&
      revokeGrantInput.shape.grantId.safeParse(value.id).success &&
      value.workspaceId === expected.workspaceId &&
      value.ownerId === expected.ownerId &&
      value.granteeId === expected.granteeId &&
      value.expiresAt === expected.expiresAt,
  );
}

export async function createEditGrantWithDeps(
  value: unknown,
  dependencies: GrantActionDependencies,
): Promise<ActionResult<EditGrant>> {
  const parsed = parseGrantInput(value, dependencies.now());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "unrecognized_keys" && issue.keys.includes("ownerId")) {
      return { ok: false, message: "只有记录所有者可以授权编辑" };
    }
    return validationFailure(issue?.message ?? "请检查编辑授权", String(issue?.path[0] ?? "expiresAt"));
  }

  const member = await dependencies.currentMember();
  if (parsed.data.granteeId === member.userId) {
    return { ok: false, message: "不能给自己授权编辑" };
  }

  let target: MemberLookup;
  try {
    target = await dependencies.findWorkspaceMember(member.workspaceId, parsed.data.granteeId);
  } catch {
    target = { ok: false };
  }
  if (!target.ok) return { ok: false, message: "成员校验失败，请稍后重试" };
  if (!target.found) return { ok: false, message: "被授权成员不在当前工作区" };

  const expected = {
    workspaceId: member.workspaceId,
    ownerId: member.userId,
    granteeId: parsed.data.granteeId,
    expiresAt: parsed.data.expiresAt,
  };
  let result: CreateGrantResult;
  try {
    result = await dependencies.createGrantAtomic(expected);
  } catch {
    return { ok: false, message: "编辑授权创建失败，请稍后重试" };
  }
  if (result.error || !isExactGrant(result.data, expected)) {
    return { ok: false, message: "编辑授权创建失败，请稍后重试" };
  }
  dependencies.revalidate("/");
  return { ok: true, data: result.data };
}

export async function revokeEditGrantWithDeps(
  value: unknown,
  dependencies: GrantActionDependencies,
): Promise<ActionResult> {
  const parsed = revokeGrantInput.safeParse(value);
  if (!parsed.success) return validationFailure(parsed.error.issues[0]?.message ?? "编辑授权无效", "grantId");
  const member = await dependencies.currentMember();
  let result: RevokeGrantResult;
  try {
    result = await dependencies.revokeGrantAtomic({
      grantId: parsed.data.grantId,
      workspaceId: member.workspaceId,
      ownerId: member.userId,
    });
  } catch {
    return { ok: false, message: "编辑授权撤销失败，请稍后重试" };
  }
  if (result.error || result.data?.id !== parsed.data.grantId) {
    return { ok: false, message: "编辑授权撤销失败，请稍后重试" };
  }
  dependencies.revalidate("/");
  return { ok: true };
}

async function sessionFindWorkspaceMember(workspaceId: string, userId: string): Promise<MemberLookup> {
  try {
    const supabase = await createServerClient();
    const response = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (response.error) return { ok: false };
    return { ok: true, found: Boolean(response.data) };
  } catch {
    return { ok: false };
  }
}

function sessionDependencies(): GrantActionDependencies {
  return {
    currentMember: requireMember,
    findWorkspaceMember: sessionFindWorkspaceMember,
    async createGrantAtomic(input) {
      const supabase = await createServerClient();
      const response = await supabase.rpc("create_edit_grant_for", {
        p_workspace: input.workspaceId,
        p_grantee: input.granteeId,
        p_expires_at: input.expiresAt,
      });
      const id = typeof response.data === "string" ? response.data : null;
      return {
        data: id ? { id, ...input } : null,
        error: response.error,
      };
    },
    async revokeGrantAtomic(input) {
      const supabase = await createServerClient();
      const response = await supabase.rpc("revoke_edit_grant_for", {
        workspace: input.workspaceId,
        grant_id: input.grantId,
      });
      return {
        data: response.data === input.grantId ? { id: input.grantId } : null,
        error: response.error,
      };
    },
    now: () => new Date(),
    revalidate: revalidatePath,
  };
}

export async function createEditGrant(value: unknown): Promise<ActionResult<EditGrant>> {
  return createEditGrantWithDeps(value, sessionDependencies());
}

export async function revokeEditGrant(value: unknown): Promise<ActionResult> {
  return revokeEditGrantWithDeps(value, sessionDependencies());
}
