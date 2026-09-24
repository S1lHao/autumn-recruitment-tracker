import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";

export type CurrentMember = {
  userId: string;
  workspaceId: string;
  email: string;
  role: "admin" | "member";
};

type AuthenticatedUser = { id: string; email?: string | null };

export type CurrentMemberDependencies = {
  getUser: () => Promise<AuthenticatedUser | null>;
  getMembership: (userId: string) => Promise<
    | { workspaceId: string; email: string; role: "admin" | "member" }
    | null
  >;
};

export type RequireMemberDependencies = CurrentMemberDependencies & {
  redirect: (destination: string) => never;
};

export async function getCurrentMemberWithDeps(
  dependencies: CurrentMemberDependencies,
): Promise<CurrentMember | null> {
  const user = await dependencies.getUser();
  if (!user) return null;

  const membership = await dependencies.getMembership(user.id);
  if (!membership) return null;

  return {
    userId: user.id,
    workspaceId: membership.workspaceId,
    email: membership.email,
    role: membership.role,
  };
}

export async function requireMemberWithDeps(
  dependencies: RequireMemberDependencies,
): Promise<CurrentMember> {
  const user = await dependencies.getUser();
  if (!user) return dependencies.redirect("/login");

  const membership = await dependencies.getMembership(user.id);
  if (!membership) return dependencies.redirect("/login?error=not_invited");

  return {
    userId: user.id,
    workspaceId: membership.workspaceId,
    email: membership.email,
    role: membership.role,
  };
}

async function getAuthenticatedUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getMembershipForUser(userId: string) {
  const supabase = await createServerClient();
  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase.from("profiles").select("email").eq("id", userId).maybeSingle(),
    ]);

  if (
    membershipError ||
    profileError ||
    !membership ||
    !profile ||
    (membership.role !== "admin" && membership.role !== "member")
  ) {
    return null;
  }

  return {
    workspaceId: membership.workspace_id,
    email: profile.email,
    role: membership.role,
  };
}

/** Returns the RLS-visible membership for the authenticated user only. */
export const requireMember = cache(async function requireMember(): Promise<CurrentMember> {
  return requireMemberWithDeps({
    getUser: getAuthenticatedUser,
    getMembership: getMembershipForUser,
    redirect,
  });
});
