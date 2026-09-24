import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { InviteMemberForm } from "./invite-member-form";

it("submits an invitation with accessible success and failure feedback", async () => {
  const action = vi.fn().mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<InviteMemberForm action={action} loginUrl="https://tracker.example/login" role="admin" />);
  await user.type(screen.getByLabelText("协作者邮箱"), "new@example.com");
  await user.click(screen.getByRole("button", { name: "发送邀请" }));
  expect(action).toHaveBeenCalled();
  expect(await screen.findByText("邀请已发送，现在可以把登录地址发给对方")).toBeInTheDocument();
  expect(screen.getByText("邀请已发送，现在可以把登录地址发给对方").closest("p")).toHaveAttribute("aria-live", "polite");
  expect(screen.getByLabelText("协作者登录地址")).toHaveValue("https://tracker.example/login");
});
