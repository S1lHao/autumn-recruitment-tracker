import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import LoginPage from "./page";

it("offers a safe recovery message for an invalid callback link", async () => {
  render(await LoginPage({ searchParams: Promise.resolve({ error: "invalid_link" }) }));

  expect(
    screen.getByText("登录链接无效或已过期，请重新发送。"),
  ).toBeInTheDocument();
});

it("explains when an authenticated account has no workspace membership", async () => {
  render(await LoginPage({ searchParams: Promise.resolve({ error: "not_invited" }) }));

  expect(screen.getByText("该账号尚未加入工作台。")).toBeInTheDocument();
});
