import { NextResponse } from "next/server";
import { parseServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import {
  completeAuthCallback,
  INVALID_LINK,
  type CallbackDependencies,
} from "@/features/auth/callback";

const INITIAL_WORKSPACE_NAME = "秋招工作台";

async function callbackDependencies(): Promise<CallbackDependencies> {
  const environment = parseServerEnv();
  const supabase = await createServerClient();
  return {
    async exchangeCode(code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return !error;
    },
    async verifyToken(tokenHash, type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
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
    async bootstrapWorkspace(userId, email) {
      const { error } = await createAdminClient().rpc("bootstrap_workspace_for", {
        initial_user_id: userId,
        initial_email: email,
        workspace_name: INITIAL_WORKSPACE_NAME,
      });
      return !error;
    },
    initialAdminEmail: environment.INITIAL_ADMIN_EMAIL,
  };
}

async function handleCallback(
  url: URL,
  parameters: { code?: string | null; tokenHash?: string | null; type?: string | null },
  status = 307,
) {
  let destination: "/" | typeof INVALID_LINK = INVALID_LINK;
  try {
    destination = await completeAuthCallback(parameters, await callbackDependencies());
  } catch {
    // Authentication and RPC errors must not expose provider details to users.
  }
  return NextResponse.redirect(new URL(destination, url.origin), status);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handleCallback(url, {
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const formData = await request.formData();
  return handleCallback(
    url,
    {
      tokenHash: formData.get("token_hash")?.toString(),
      type: formData.get("type")?.toString(),
    },
    303,
  );
}
