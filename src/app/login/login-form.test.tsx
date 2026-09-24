import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import type { ActionResult } from "@/features/shared/result";

type LoginAction = (state: ActionResult, formData: FormData) => Promise<ActionResult>;

function renderForm(action: LoginAction) {
  return render(<LoginForm action={action} />);
}

describe("LoginForm", () => {
  it("shows the generic success state after a submitted address is accepted", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    renderForm(action);

    await user.type(screen.getByLabelText("邮箱地址"), "member@example.com");
    await user.click(screen.getByRole("button", { name: "发送登录验证码" }));

    expect(await screen.findByText("验证码已发送，请查看最新邮件")).toBeInTheDocument();
  });

  it("shows the safe uninvited result and preserves the typed address", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: false, message: "该邮箱尚未受邀" });
    renderForm(action);

    const email = screen.getByLabelText("邮箱地址");
    await user.type(email, "new@example.com");
    await user.click(screen.getByRole("button", { name: "发送登录验证码" }));

    expect(await screen.findByText("该邮箱尚未受邀")).toBeInTheDocument();
    expect(email).toHaveValue("new@example.com");
  });

  it("renders field validation errors accessibly", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: "请输入有效的邮箱地址",
      fieldErrors: { email: ["请输入有效的邮箱地址"] },
    });
    renderForm(action);

    await user.click(screen.getByRole("button", { name: "发送登录验证码" }));

    expect(await screen.findByText("请输入有效的邮箱地址")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByLabelText("邮箱地址")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the submit control while the action is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const action = vi.fn(
      () => new Promise<ActionResult>((done) => {
        resolve = done;
      }),
    );
    renderForm(action);

    await user.click(screen.getByRole("button", { name: "发送登录验证码" }));

    expect(await screen.findByRole("button", { name: "正在发送…" })).toBeDisabled();
    resolve({ ok: true });
    expect(await screen.findByText("验证码已发送，请查看最新邮件")).toBeInTheDocument();
  });

  it("submits the email and eight-digit code without requiring a mail link", async () => {
    const user = userEvent.setup();
    const verifyAction = vi.fn().mockResolvedValue({ ok: true });
    render(<LoginForm action={vi.fn()} verifyAction={verifyAction} />);

    await user.type(screen.getByLabelText("邮箱地址"), "member@example.com");
    await user.type(screen.getByLabelText("8 位验证码"), "12345678");
    await user.click(screen.getByRole("button", { name: "验证并登录" }));

    expect(verifyAction).toHaveBeenCalled();
    const submitted = verifyAction.mock.calls[0][1] as FormData;
    expect(submitted.get("email")).toBe("member@example.com");
    expect(submitted.get("token")).toBe("12345678");
  });
});
