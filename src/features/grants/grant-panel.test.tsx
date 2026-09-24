import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEditGrant: vi.fn(),
  revokeEditGrant: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./actions", () => ({ createEditGrant: mocks.createEditGrant, revokeEditGrant: mocks.revokeEditGrant }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { GrantPanel } from "./grant-panel";
import type { WorkspaceMember } from "@/features/applications/types";

const owner: WorkspaceMember = { id: "00000000-0000-4000-8000-000000000010", email: "owner@example.com", displayName: "我", role: "member" };
const teammate: WorkspaceMember = { id: "00000000-0000-4000-8000-000000000020", email: "teammate@example.com", displayName: "队友", role: "member" };

const props = {
  ownerId: owner.id,
  members: [owner, teammate],
  activeGrants: [{ id: "00000000-0000-4000-8000-000000000200", workspaceId: "00000000-0000-4000-8000-000000000100", ownerId: owner.id, granteeId: teammate.id, expiresAt: "2099-09-08T01:30:00.000Z" }],
  initialNow: "2026-09-07T04:00:00.000Z",
};

beforeEach(() => {
  mocks.createEditGrant.mockReset();
  mocks.revokeEditGrant.mockReset();
  mocks.refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("offers teammates, one hour, one day, seven days, and custom expiry", async () => {
  const user = userEvent.setup();
  render(<GrantPanel {...props} />);
  expect(screen.getByRole("option", { name: "队友（teammate@example.com）" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /owner@example.com/ })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "1 小时" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "1 天" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "7 天" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "自定义" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("授权时长"), "custom");
  expect(screen.getByLabelText("自定义到期时间（北京时间）")).toHaveAttribute("type", "datetime-local");
});

it("formats active grants in Asia/Shanghai and revokes with duplicate-submit protection", async () => {
  const user = userEvent.setup();
  let resolve!: (value: { ok: true }) => void;
  mocks.revokeEditGrant.mockReturnValue(new Promise((done) => { resolve = done; }));
  const { container } = render(<GrantPanel {...props} />);
  const status = screen.getByRole("status");
  expect(screen.getByText(/2099\/09\/08 09:30/)).toBeInTheDocument();
  const revoke = screen.getByRole("button", { name: "撤销队友的编辑权限" });
  await user.click(revoke);
  expect(revoke).toBeDisabled();
  await user.click(revoke);
  expect(mocks.revokeEditGrant).toHaveBeenCalledTimes(1);
  resolve({ ok: true });
  expect(await screen.findByText("编辑权限已撤销")).toBeInTheDocument();
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  expect(screen.getAllByText("编辑权限已撤销")).toHaveLength(1);
  expect(document.activeElement).not.toBe(status);
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("keeps teammate and expiry selections after a safe server error", async () => {
  const user = userEvent.setup();
  mocks.createEditGrant.mockResolvedValue({ ok: false, message: "编辑授权创建失败，请稍后重试" });
  render(<GrantPanel {...props} />);
  await user.selectOptions(screen.getByLabelText("授权时长"), "custom");
  await user.type(screen.getByLabelText("自定义到期时间（北京时间）"), "2026-09-09T12:00");
  await user.click(screen.getByRole("button", { name: "授予编辑权限" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("编辑授权创建失败，请稍后重试");
  expect(screen.getByLabelText("授权成员")).toHaveValue(teammate.id);
  expect(screen.getByLabelText("授权时长")).toHaveValue("custom");
  expect(screen.getByLabelText("自定义到期时间（北京时间）")).toHaveValue("2026-09-09T12:00");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("submits preset expiry as an absolute instant and refreshes on success", async () => {
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-07T04:00:00.000Z").getTime());
  mocks.createEditGrant.mockResolvedValue({ ok: true, data: props.activeGrants[0] });
  render(<GrantPanel {...props} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "授予编辑权限" })));
  expect(mocks.createEditGrant).toHaveBeenCalledWith({ granteeId: teammate.id, expiresAt: "2026-09-07T05:00:00.000Z" });
  expect(await screen.findByText("编辑权限已更新")).toBeInTheDocument();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("announces a successful permission change once without moving focus to the live region", async () => {
  const user = userEvent.setup();
  mocks.createEditGrant.mockResolvedValue({ ok: true, data: props.activeGrants[0] });
  const { container } = render(<GrantPanel {...props} />);
  const submit = screen.getByRole("button", { name: "授予编辑权限" });
  const status = screen.getByRole("status");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

  await user.click(submit);

  expect(await screen.findByText("编辑权限已更新")).toBeInTheDocument();
  expect(screen.getAllByText("编辑权限已更新")).toHaveLength(1);
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  expect(document.activeElement).not.toBe(status);
});

it("computes a preset from submit time rather than the server render time", async () => {
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-07T04:30:00.000Z").getTime());
  mocks.createEditGrant.mockResolvedValue({ ok: true, data: props.activeGrants[0] });
  render(<GrantPanel {...props} activeGrants={[]} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "授予编辑权限" })));

  expect(mocks.createEditGrant).toHaveBeenCalledWith({ granteeId: teammate.id, expiresAt: "2026-09-07T05:30:00.000Z" });
});

it("keeps a newly created grant but replaces stale success copy when refresh cannot load grants", async () => {
  const user = userEvent.setup();
  const created = { ...props.activeGrants[0], id: "00000000-0000-4000-8000-000000000201" };
  mocks.createEditGrant.mockResolvedValue({ ok: true, data: created });
  const { rerender } = render(<GrantPanel {...props} activeGrants={[]} />);
  await user.click(screen.getByRole("button", { name: "授予编辑权限" }));
  expect(await screen.findByText("编辑权限已更新")).toBeInTheDocument();

  rerender(<GrantPanel {...props} activeGrants={undefined} loadError="编辑权限加载失败，请稍后重试" />);
  expect(screen.getByText(/队友 · 到期/)).toBeInTheDocument();
  expect(screen.queryByText("编辑权限已更新")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("编辑权限加载失败，请稍后重试");
});

it("keeps a successful local revocation when the following refresh cannot load grants", async () => {
  const user = userEvent.setup();
  mocks.revokeEditGrant.mockResolvedValue({ ok: true });
  const { rerender } = render(<GrantPanel {...props} />);
  await user.click(screen.getByRole("button", { name: "撤销队友的编辑权限" }));
  expect(await screen.findByText("编辑权限已撤销")).toBeInTheDocument();

  rerender(<GrantPanel {...props} activeGrants={undefined} loadError="编辑权限加载失败，请稍后重试" />);
  expect(screen.getByText("无法确认当前生效授权")).toBeInTheDocument();
  expect(screen.queryByText("编辑权限已撤销")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("编辑权限加载失败，请稍后重试");
});

it("keeps an unchanged loading error above a later local success notice", async () => {
  const user = userEvent.setup();
  mocks.createEditGrant.mockResolvedValue({ ok: true, data: props.activeGrants[0] });
  const failedProps = { ...props, activeGrants: undefined, loadError: "授权列表加载失败" };
  const { rerender } = render(<GrantPanel {...failedProps} />);

  await user.click(screen.getByRole("button", { name: "授予编辑权限" }));
  rerender(<GrantPanel {...failedProps} />);

  expect(screen.getByRole("alert")).toHaveTextContent("授权列表加载失败");
  expect(screen.queryByText("编辑权限已更新")).not.toBeInTheDocument();

  rerender(<GrantPanel {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("编辑权限已更新");
});

it("shows a local custom-expiry error above a pre-existing loading error", async () => {
  const user = userEvent.setup();
  render(<GrantPanel {...props} activeGrants={undefined} loadError="授权列表加载失败" />);
  await user.selectOptions(screen.getByLabelText("授权时长"), "custom");

  fireEvent.submit(screen.getByRole("button", { name: "授予编辑权限" }).closest("form")!);

  expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的北京时间");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByLabelText("授权时长")).toHaveValue("custom");
  expect(screen.getByLabelText("自定义到期时间（北京时间）")).toHaveValue("");
  expect(mocks.createEditGrant).not.toHaveBeenCalled();
});

it("shows a server operation error above loadError and preserves the grant form", async () => {
  const user = userEvent.setup();
  mocks.createEditGrant.mockResolvedValue({ ok: false, message: "本次授权失败，请重试" });
  render(<GrantPanel {...props} activeGrants={undefined} loadError="授权列表加载失败" />);
  await user.selectOptions(screen.getByLabelText("授权时长"), "custom");
  await user.type(screen.getByLabelText("自定义到期时间（北京时间）"), "2026-09-09T12:00");
  await user.click(screen.getByRole("button", { name: "授予编辑权限" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("本次授权失败，请重试");
  expect(alert).toHaveFocus();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByLabelText("授权成员")).toHaveValue(teammate.id);
  expect(screen.getByLabelText("授权时长")).toHaveValue("custom");
  expect(screen.getByLabelText("自定义到期时间（北京时间）")).toHaveValue("2026-09-09T12:00");
});

it("shows a revoke failure above loadError without removing the known grant", async () => {
  const user = userEvent.setup();
  mocks.revokeEditGrant.mockResolvedValue({ ok: false, message: "本次撤销失败，请重试" });
  render(<GrantPanel {...props} loadError="授权列表加载失败" />);
  await user.click(screen.getByRole("button", { name: "撤销队友的编辑权限" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("本次撤销失败，请重试");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByText(/队友 · 到期/)).toBeInTheDocument();
});

it("removes a grant from the active list as soon as its absolute expiry passes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T04:00:00.000Z"));
  render(
    <GrantPanel
      {...props}
      activeGrants={[{ ...props.activeGrants[0], expiresAt: "2026-09-07T04:00:01.000Z" }]}
    />,
  );
  expect(screen.getByText(/队友 · 到期/)).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(1_001));

  expect(screen.queryByText(/队友 · 到期/)).not.toBeInTheDocument();
  expect(screen.getByText("暂无生效中的编辑授权")).toBeInTheDocument();
});
