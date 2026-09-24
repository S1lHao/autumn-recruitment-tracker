import "server-only";

import { requireMember, type CurrentMember } from "@/features/auth/authorization";
import { createServerClient } from "@/lib/supabase/server";
import type { EditGrant } from "./schemas";

type GrantRow = {
  id: string;
  workspace_id: string;
  owner_id: string;
  grantee_id: string;
  expires_at: string;
};

type GrantQueryResponse = { data: GrantRow[] | null; error: unknown | null };

export type GrantQueryDependencies = {
  currentMember: () => Promise<CurrentMember>;
  listOwnedActive: (scope: { workspaceId: string; ownerId: string; now: string }) => Promise<GrantQueryResponse>;
};

function mapGrant(row: GrantRow): EditGrant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerId: row.owner_id,
    granteeId: row.grantee_id,
    expiresAt: row.expires_at,
  };
}

export async function listOwnedActiveGrantsWithDeps(
  dependencies: GrantQueryDependencies,
  now: Date = new Date(),
): Promise<{ ok: true; data: EditGrant[] } | { ok: false; message: string }> {
  const member = await dependencies.currentMember();
  try {
    const response = await dependencies.listOwnedActive({
      workspaceId: member.workspaceId,
      ownerId: member.userId,
      now: now.toISOString(),
    });
    if (response.error || !response.data) throw new Error("grant_query_failed");
    const grants = response.data.map(mapGrant);
    if (grants.some((grant) => grant.workspaceId !== member.workspaceId || grant.ownerId !== member.userId)) {
      throw new Error("grant_scope_mismatch");
    }
    return { ok: true, data: grants };
  } catch {
    return { ok: false, message: "编辑权限加载失败，请稍后重试" };
  }
}

async function sessionListOwnedActive(scope: { workspaceId: string; ownerId: string; now: string }): Promise<GrantQueryResponse> {
  const supabase = await createServerClient();
  const response = await supabase
    .from("edit_grants")
    .select("id, workspace_id, owner_id, grantee_id, expires_at")
    .eq("workspace_id", scope.workspaceId)
    .eq("owner_id", scope.ownerId)
    .is("revoked_at", null)
    .gt("expires_at", scope.now)
    .order("expires_at", { ascending: true });
  return { data: response.data as unknown as GrantRow[] | null, error: response.error };
}

export async function listOwnedActiveGrants(now: Date = new Date()) {
  return listOwnedActiveGrantsWithDeps({ currentMember: requireMember, listOwnedActive: sessionListOwnedActive }, now);
}
