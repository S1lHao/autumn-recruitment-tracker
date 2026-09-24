"use server";

import "server-only";

import { redirect } from "next/navigation";
import { parseServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { completeAuthCallback } from "./callback";
import { type CurrentMember, requireMember } from "./authorization";
import { parseEmail } from "./schemas";
import { type ActionResult } from "@/features/shared/result";

const INVALID_EMAIL = "请输入有效的邮箱地址";
const INVALID_LOGIN_CODE = "验证码无效或已过期，请重新获取";
const INVALID_LOGIN_CODE_FORMAT = "请输入邮件中的 8 位验证码";
const EXISTING_MEMBER = "该邮箱已是成员";
const ACTIVE_PENDING_INVITATION = "该邮箱已有待处理邀请";
const INVITATION_CREATION_FAILED = "邀请创建失败，请稍后重试";
const INVITATION_DELIVERY_FAILED = "邀请邮件发送失败，请稍后重试";
const INVITATION_ACTIVATION_FAILED = "邀请激活失败，请稍后重试";
const INVITATION_RECOVERY_FAILED = "邀请发送后的清理失败，请联系管理员";

function invalidEmailResult(): ActionResult {
  return {
    ok: false,
    message: INVALID_EMAIL,
    fieldErrors: { email: [INVALID_EMAIL] },
  };
}

export type LoginDependencies = {
  initialAdminEmail: string;
  siteUrl: string;
  hasExistingMember: (email: string) => Promise<boolean>;
  hasActiveInvitation: (email: string) => Promise<boolean>;
  sendOtp: (
    email: string,
    shouldCreateUser: boolean,
    emailRedirectTo: string,
  ) => Promise<boolean>;
};

export async function requestLoginLinkWithDeps(
  value: unknown,
  dependencies: LoginDependencies,
): Promise<ActionResult> {
  const parsed = parseEmail(value);
  if (!parsed.success) return invalidEmailResult();

  const email = parsed.data;
  const isInitialAdmin = email === dependencies.initialAdminEmail;
  let isExistingMember = false;
  let hasPendingInvitation = false;
  try {
    isExistingMember = await dependencies.hasExistingMember(email);
    hasPendingInvitation = isExistingMember
      ? false
      : await dependencies.hasActiveInvitation(email);
  } catch {
    return { ok: false, message: "登录链接发送失败，请稍后重试" };
  }

  if (!isInitialAdmin && !isExistingMember && !hasPendingInvitation) {
    return { ok: false, message: "该邮箱尚未受邀" };
  }

  let sent = false;
  try {
    sent = await dependencies.sendOtp(
      email,
      !isExistingMember,
      `${dependencies.siteUrl}/auth/callback`,
    );
  } catch {
    sent = false;
  }
  return sent ? { ok: true } : { ok: false, message: "登录链接发送失败，请稍后重试" };
}

async function hasExistingMember(email: string, workspaceId?: string) {
  const admin = createAdminClient();
  let query = admin
    .from("workspace_members")
    .select("workspace_id, profiles!inner(email)")
    .eq("profiles.email", email)
    .limit(1);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  return !error && Boolean(data?.length);
}

async function hasActiveInvitation(email: string, workspaceId?: string) {
  const admin = createAdminClient();
  let query = admin
    .from("invitations")
    .select("id")
    .eq("email", email)
    .eq("status", "pending")
    .not("delivered_at", "is", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  return !error && Boolean(data?.length);
}

function loginDependencies(): LoginDependencies {
  const environment = parseServerEnv();
  return {
    initialAdminEmail: environment.INITIAL_ADMIN_EMAIL,
    siteUrl: environment.NEXT_PUBLIC_SITE_URL,
    hasExistingMember,
    hasActiveInvitation,
    async sendOtp(email, shouldCreateUser, emailRedirectTo) {
      const supabase = await createServerClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo, shouldCreateUser },
      });
      return !error;
    },
  };
}

export async function requestLoginLink(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return requestLoginLinkWithDeps(formData.get("email"), loginDependencies());
}

/** Verifies the eight-digit email OTP without relying on tracked email links. */
export async function verifyLoginCode(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsedEmail = parseEmail(formData.get("email"));
  if (!parsedEmail.success) return invalidEmailResult();

  const token = formData.get("token")?.toString().trim() ?? "";
  if (!/^\d{8}$/.test(token)) {
    return {
      ok: false,
      message: INVALID_LOGIN_CODE_FORMAT,
      fieldErrors: { token: [INVALID_LOGIN_CODE_FORMAT] },
    };
  }

  const email = parsedEmail.data;
  const environment = parseServerEnv();
  const supabase = await createServerClient();
  let destination: "/" | "/login?error=invalid_link" = "/login?error=invalid_link";
  try {
    destination = await completeAuthCallback(
      { tokenHash: token, type: "email" },
      {
        exchangeCode: async () => false,
        async verifyToken() {
          const { error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: "email",
          });
          return !error;
        },
        async getVerifiedUser() {
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser();
          if (error || !user?.id || !user.email || !user.email_confirmed_at) return null;
          return {
            id: user.id,
            email: user.email,
            emailConfirmedAt: user.email_confirmed_at,
          };
        },
        async hasMembership(userId) {
          const { data, error } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId)
            .limit(1);
          return !error && Boolean(data?.length);
        },
        async acceptPendingInvitation() {
          const { error } = await supabase.rpc("accept_pending_invitation");
          return !error;
        },
        async bootstrapWorkspace(userId, verifiedEmail) {
          const { error } = await createAdminClient().rpc("bootstrap_workspace_for", {
            initial_user_id: userId,
            initial_email: verifiedEmail,
            workspace_name: "秋招工作台",
          });
          return !error;
        },
        initialAdminEmail: environment.INITIAL_ADMIN_EMAIL,
      },
    );
  } catch {
    destination = "/login?error=invalid_link";
  }

  if (destination === "/") redirect("/");

  await supabase.auth.signOut();
  return { ok: false, message: INVALID_LOGIN_CODE };
}

export type InviteMemberDependencies = {
  currentMember: () => Promise<CurrentMember>;
  hasExistingMember: (email: string, workspaceId: string) => Promise<boolean>;
  createInvitation: (input: {
    workspaceId: string;
    invitedBy: string;
    email: string;
    expiresAt: string;
  }) => Promise<{ invitation: { id: string } } | { errorCode: string }>;
  sendInvite: (email: string, redirectTo: string) => Promise<boolean>;
  activateInvitation: (invitationId: string) => Promise<boolean>;
  revokeInvitation: (invitationId: string) => Promise<boolean>;
  siteUrl: string;
  now: () => Date;
};

type InvitationRollbackOperations = {
  revoke: (invitationId: string) => Promise<{ error: unknown | null }>;
  remove: (invitationId: string) => Promise<{ error: unknown | null }>;
};

/** Revokes a pending invitation, deleting that exact row only if the update fails. */
export async function revokeFailedInvitation(
  invitationId: string,
  operations: InvitationRollbackOperations,
): Promise<boolean> {
  try {
    const { error } = await operations.revoke(invitationId);
    if (!error) return true;
  } catch {
    // The delete below is the best-effort fallback for a failed update request.
  }

  try {
    const { error } = await operations.remove(invitationId);
    return !error;
  } catch {
    return false;
  }
}

export async function inviteMemberWithDeps(
  value: unknown,
  dependencies: InviteMemberDependencies,
): Promise<ActionResult> {
  const parsed = parseEmail(value);
  if (!parsed.success) return invalidEmailResult();

  const member = await dependencies.currentMember();
  if (member.role !== "admin") {
    return { ok: false, message: "仅管理员可以邀请成员" };
  }

  const email = parsed.data;
  if (await dependencies.hasExistingMember(email, member.workspaceId)) {
    return { ok: false, message: EXISTING_MEMBER };
  }

  const expiresAt = new Date(
    dependencies.now().getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  let creation: { invitation: { id: string } } | { errorCode: string };
  try {
    creation = await dependencies.createInvitation({
      workspaceId: member.workspaceId,
      invitedBy: member.userId,
      email,
      expiresAt,
    });
  } catch {
    return { ok: false, message: INVITATION_CREATION_FAILED };
  }
  if ("errorCode" in creation) {
    return {
      ok: false,
      message:
        creation.errorCode === "active_pending_invitation_exists"
          ? ACTIVE_PENDING_INVITATION
          : creation.errorCode === "existing_workspace_member"
            ? EXISTING_MEMBER
          : INVITATION_CREATION_FAILED,
    };
  }
  const invitation = creation.invitation;

  let delivered = false;
  try {
    delivered = await dependencies.sendInvite(
      email,
      `${dependencies.siteUrl}/auth/callback`,
    );
  } catch {
    // Treat provider failures like a rejected delivery without leaking details.
  }
  if (!delivered) {
    return invitationFailure(invitation.id, "delivery_failed", INVITATION_DELIVERY_FAILED, dependencies);
  }

  let activated = false;
  try {
    activated = await dependencies.activateInvitation(invitation.id);
  } catch {
    activated = false;
  }
  return activated
    ? { ok: true }
    : invitationFailure(
        invitation.id,
        "activation_failed",
        INVITATION_ACTIVATION_FAILED,
        dependencies,
      );
}

async function invitationFailure(
  invitationId: string,
  category: "delivery_failed" | "activation_failed",
  message: string,
  dependencies: Pick<InviteMemberDependencies, "revokeInvitation">,
): Promise<ActionResult> {
  let compensated = false;
  try {
    compensated = await dependencies.revokeInvitation(invitationId);
  } catch {
    compensated = false;
  }
  if (!compensated) {
    console.error("invitation_compensation_failed", invitationId, category);
    return { ok: false, message: INVITATION_RECOVERY_FAILED };
  }
  return { ok: false, message };
}

function inviteMemberDependencies(): InviteMemberDependencies {
  const environment = parseServerEnv();
  return {
    currentMember: requireMember,
    hasExistingMember,
    async createInvitation(input) {
      const { data, error } = await createAdminClient().rpc(
        "create_pending_invitation_for",
        {
          workspace: input.workspaceId,
          inviter: input.invitedBy,
          invited_email: input.email,
          invite_expires_at: input.expiresAt,
        },
      );
      if (error) {
        return {
          errorCode:
            error.message === "active_pending_invitation_exists" ||
            error.message === "existing_workspace_member"
              ? error.message
              : "invitation_creation_failed",
        };
      }
      return typeof data === "string"
        ? { invitation: { id: data } }
        : { errorCode: "invitation_creation_failed" };
    },
    async sendInvite(email, redirectTo) {
      const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      return !error;
    },
    async activateInvitation(invitationId) {
      const { data, error } = await createAdminClient()
        .from("invitations")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", invitationId)
        .eq("status", "pending")
        .is("delivered_at", null)
        .select("id")
        .maybeSingle();
      return !error && Boolean(data);
    },
    async revokeInvitation(invitationId) {
      const admin = createAdminClient();
      return revokeFailedInvitation(invitationId, {
        async revoke(id) {
          const { error } = await admin
            .from("invitations")
            .update({ status: "revoked", accepted_at: null })
            .eq("id", id)
            .eq("status", "pending");
          return { error };
        },
        async remove(id) {
          const { error } = await admin
            .from("invitations")
            .delete()
            .eq("id", id)
            .eq("status", "pending");
          return { error };
        },
      });
    },
    siteUrl: environment.NEXT_PUBLIC_SITE_URL,
    now: () => new Date(),
  };
}

export async function inviteMember(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return inviteMemberWithDeps(formData.get("email"), inviteMemberDependencies());
}

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
