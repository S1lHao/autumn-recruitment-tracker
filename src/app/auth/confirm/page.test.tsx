import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import ConfirmAuthPage from "./page";

it("requires an explicit click before submitting a scanner-safe email token", async () => {
  const { container } = render(
    await ConfirmAuthPage({
      searchParams: Promise.resolve({ token_hash: "token-value", type: "email" }),
    }),
  );

  expect(screen.getByRole("button", { name: "继续登录" })).toBeInTheDocument();
  expect(container.querySelector('form[action="/auth/callback"][method="post"]')).not.toBeNull();
  expect(container.querySelector('input[name="token_hash"]')).toHaveValue("token-value");
});

it("does not expose a confirmation action for unsupported token types", async () => {
  render(
    await ConfirmAuthPage({
      searchParams: Promise.resolve({ token_hash: "token-value", type: "recovery" }),
    }),
  );

  expect(screen.queryByRole("button", { name: "继续登录" })).not.toBeInTheDocument();
  expect(screen.getByText("登录链接无效或已过期，请重新发送。")).toBeInTheDocument();
});
