import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import RouteError from "@/app/error";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";
import { EmptyState, PermissionBadge } from "./empty-state";

it("distinguishes an empty list from empty filtered results", async () => {
  const user = userEvent.setup();
  const onClear = vi.fn();
  const { rerender } = render(<EmptyState kind="empty" />);
  expect(screen.getByText("还没有投递记录")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "清除筛选" })).not.toBeInTheDocument();

  rerender(<EmptyState kind="filtered" onClear={onClear} />);
  expect(screen.getByText("没有符合筛选条件的记录")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(onClear).toHaveBeenCalledOnce();
});

it("announces permission without relying on color", () => {
  const { rerender } = render(<PermissionBadge mode="readonly" />);
  expect(screen.getByText("只读：你可以查看，但不能修改此成员的记录")).toBeInTheDocument();
  expect(screen.getByText("只读", { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  rerender(<PermissionBadge mode="own" />);
  expect(screen.getByText("本人可编辑：你可以新增、修改和删除自己的记录")).toBeInTheDocument();
});

it("uses non-text contrast tokens and a real two-axis sticky table scroller", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  expect(css).toContain("--border-strong: #6b7280;");
  expect(css).toContain("--focus-ring: #1d4ed8;");
  expect(css).toContain("outline: 3px solid var(--focus-ring);");
  expect(css).toMatch(/\.application-table-scroll\s*\{[\s\S]*?max-height:\s*min\(68vh, 44rem\);[\s\S]*?overflow:\s*auto;[\s\S]*?\}/);
  expect(css).toMatch(/\.application-table th\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?\}/);
});

it("provides accessible route loading and recovery states", async () => {
  const user = userEvent.setup();
  const reset = vi.fn();
  const { rerender } = render(<Loading />);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载秋招协作台");

  rerender(<RouteError error={new Error("private details")} reset={reset} />);
  expect(screen.getByRole("alert")).toHaveTextContent("页面暂时无法加载");
  expect(screen.queryByText("private details")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(reset).toHaveBeenCalledOnce();
});

it("offers a safe way home from a missing page", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "返回秋招协作台" })).toHaveAttribute("href", "/");
});
