"use client";

import { useActionState, useState } from "react";
import { inviteMember } from "./actions";
import type { ActionResult } from "@/features/shared/result";

type InviteAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>;
type FormState = ActionResult | null;

export function InviteMemberForm({
  action = inviteMember,
  role = "admin",
  loginUrl = "/login",
}: {
  action?: InviteAction;
  role?: "admin" | "member";
  loginUrl?: string;
}) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const submit = (state: FormState, formData: FormData) => action(state ?? { ok: true }, formData);
  const [state, formAction, isPending] = useActionState(submit, null);
  if (role !== "admin") return null;
  const emailError = state && !state.ok ? state.fieldErrors?.email?.[0] : undefined;

  const copyLoginUrl = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="invite-content">
      <ol className="invite-steps">
        <li><span>1</span>输入协作者邮箱并发送邀请</li>
        <li><span>2</span>把下方登录地址发给对方</li>
        <li><span>3</span>对方用受邀邮箱获取验证码并登录</li>
      </ol>
      <form action={formAction} className="invite-form" noValidate>
        <label htmlFor="invite-email">协作者邮箱</label>
        <div className="invite-control-row">
          <input id="invite-email" name="email" type="email" autoComplete="email" placeholder="teammate@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "invite-email-error" : undefined} />
          <button type="submit" disabled={isPending}>{isPending ? "正在发送…" : "发送邀请"}</button>
        </div>
        {emailError ? <p className="field-error" id="invite-email-error" role="alert">{emailError}</p> : null}
        <p className={state?.ok ? "invite-feedback success" : "invite-feedback"} aria-live="polite">{state?.ok ? "邀请已发送，现在可以把登录地址发给对方" : state?.message && !emailError ? state.message : null}</p>
      </form>
      <div className="share-link-block">
        <label htmlFor="workspace-login-url">协作者登录地址</label>
        <div className="invite-control-row">
          <input id="workspace-login-url" readOnly value={loginUrl} />
          <button onClick={() => void copyLoginUrl()} type="button">{copied ? "已复制" : "复制登录地址"}</button>
        </div>
        <p>登录地址可以重复分享，但只有已受邀邮箱能够收到有效验证码并进入工作台。</p>
      </div>
    </div>
  );
}
