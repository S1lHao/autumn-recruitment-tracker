"use client";

import { useActionState, useState } from "react";
import { requestLoginLink, verifyLoginCode } from "@/features/auth/actions";
import { type ActionResult } from "@/features/shared/result";

type LoginAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>;
type VerifyAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>;
type FormState = ActionResult | null;

export function LoginForm({
  action = requestLoginLink,
  verifyAction = verifyLoginCode,
}: {
  action?: LoginAction;
  verifyAction?: VerifyAction;
}) {
  const [email, setEmail] = useState("");
  const submit = async (state: FormState, formData: FormData) =>
    action(state ?? { ok: true }, formData);
  const [state, formAction, isPending] = useActionState(submit, null);
  const verify = async (verifyState: FormState, formData: FormData) =>
    verifyAction(verifyState ?? { ok: true }, formData);
  const [verifyState, verifyFormAction, isVerifying] = useActionState(verify, null);
  const emailError = state && !state.ok ? state.fieldErrors?.email?.[0] : undefined;
  const verifyEmailError =
    verifyState && !verifyState.ok ? verifyState.fieldErrors?.email?.[0] : undefined;
  const tokenError =
    verifyState && !verifyState.ok ? verifyState.fieldErrors?.token?.[0] : undefined;

  return (
    <div className="login-flow">
      <section className="login-step" aria-labelledby="request-code-heading">
        <header className="login-step-heading">
          <span aria-hidden="true">1</span>
          <div><h3 id="request-code-heading">获取验证码</h3><p>填写管理员已经邀请的邮箱</p></div>
        </header>
        <form action={formAction} className="login-form" noValidate>
          <label className="login-field" htmlFor="email">
            <span>邮箱地址</span>
            <input
              aria-describedby={emailError ? "email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </label>
          {emailError ? <p className="auth-form-message error" id="email-error" role="alert">{emailError}</p> : null}
          <button className="auth-primary-button" disabled={isPending} type="submit">
            {isPending ? "正在发送…" : "发送登录验证码"}
          </button>
          <p className={state?.ok ? "auth-form-message success" : "auth-form-message"} aria-live="polite">
            {state?.ok
              ? "验证码已发送，请查看最新邮件"
              : state?.message && !emailError
                ? state.message
                : null}
          </p>
        </form>
      </section>

      <div className="login-step-divider" aria-hidden="true"><span /></div>

      <section className="login-step" aria-labelledby="verify-code-heading">
        <header className="login-step-heading">
          <span aria-hidden="true">2</span>
          <div><h3 id="verify-code-heading">验证并登录</h3><p>输入最新邮件中的 8 位数字</p></div>
        </header>
        <form action={verifyFormAction} className="login-form" noValidate>
          <input name="email" type="hidden" value={email} />
          {verifyEmailError ? <p className="auth-form-message error" role="alert">{verifyEmailError}</p> : null}
          <label className="login-field" htmlFor="token">
            <span>8 位验证码</span>
            <input
              aria-describedby={tokenError ? "token-error" : undefined}
              aria-invalid={Boolean(tokenError)}
              autoComplete="one-time-code"
              className="otp-input"
              id="token"
              inputMode="numeric"
              maxLength={8}
              name="token"
              pattern="[0-9]{8}"
              placeholder="••••••••"
              required
              type="text"
            />
          </label>
          {tokenError ? <p className="auth-form-message error" id="token-error" role="alert">{tokenError}</p> : null}
          <button className="auth-primary-button" disabled={isVerifying || !email} type="submit">
            {isVerifying ? "正在验证…" : "验证并登录"}
          </button>
          <p className={verifyState?.ok ? "auth-form-message success" : "auth-form-message"} aria-live="polite">
            {verifyState?.ok
              ? "验证成功，正在登录…"
              : verifyState?.message && !verifyEmailError && !tokenError
                ? verifyState.message
                : null}
          </p>
        </form>
      </section>
    </div>
  );
}
