import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ApplicationWorkspace } from "./application-workspace";
import type { Application, WorkspaceMember } from "./types";

const members: WorkspaceMember[] = [
  { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com", displayName: "我", role: "admin" },
  { id: "22222222-2222-4222-8222-222222222222", email: "other@example.com", displayName: "同事", role: "member" },
];
const applications: Application[] = [
  { id: "one", workspaceId: "w", ownerId: members[0].id, company: "OpenAI", role: "工程师", location: "上海", stage: "面试", appliedOn: null, nextStep: "下一轮", deadline: null, jobUrl: null, notes: "", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
  { id: "two", workspaceId: "w", ownerId: members[0].id, company: "Example", role: "产品", location: "北京", stage: "Offer", appliedOn: null, nextStep: "", deadline: null, jobUrl: null, notes: "", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
];
const applicationNow = "2026-09-07T12:00:00.000Z";

function renderWorkspace(permission: "own" | "readonly" = "own") {
  return render(<ApplicationWorkspace currentMember={members[0]} members={members} selectedMember={permission === "own" ? members[0] : members[1]} applications={applications} applicationNow={applicationNow} permission={permission} />);
}

it("shows member context, summaries, filters, and switches via a safe member URL", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  expect(screen.getByText("本人可编辑：你可以新增、修改和删除自己的记录")).toBeInTheDocument();
  expect(screen.getByText("已投递公司")).toBeInTheDocument();
  expect(screen.getByText("面试中")).toBeInTheDocument();
  expect(screen.getByText("待处理")).toBeInTheDocument();
  expect(screen.getAllByText("Offer")).not.toHaveLength(0);
  expect(screen.getByText("共 2 条")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("用户名称"), members[1].id);
  expect(screen.getByLabelText("用户名称")).toHaveValue(members[1].id);
  expect(router.replace).toHaveBeenCalledWith(`?member=${members[1].id}`, { scroll: false });
  await user.type(screen.getByLabelText("公司/岗位搜索"), "openai");
  expect(screen.getByText("共 1 条")).toBeInTheDocument();
  expect(screen.getAllByText("OpenAI")).toHaveLength(1);
  expect(screen.queryAllByText("Example")).toHaveLength(0);
});

it("makes readonly access explicit and only exposes invitation controls to admins", () => {
  renderWorkspace("readonly");
  expect(screen.getByText("只读：你可以查看，但不能修改此成员的记录")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "邀请成员" })).toBeInTheDocument();
  render(<ApplicationWorkspace currentMember={{ ...members[0], role: "member" }} members={members} selectedMember={members[0]} applications={applications} applicationNow={applicationNow} permission="own" />);
  expect(screen.queryAllByRole("heading", { name: "邀请成员" })).toHaveLength(1);
});

it("suppresses valid-looking record content when loading fails and provides a safe retry", () => {
  render(<ApplicationWorkspace currentMember={members[0]} members={members} selectedMember={members[0]} applications={applications} applicationNow={applicationNow} permission="own" loadError="申请记录加载失败，请稍后重试" />);
  expect(screen.getByRole("alert")).toHaveTextContent("申请记录加载失败，请稍后重试");
  expect(screen.getByRole("link", { name: "重试" })).toBeInTheDocument();
  expect(screen.queryByLabelText("申请汇总")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("申请记录列表")).not.toBeInTheDocument();
});

it("distinguishes an owner with no records from filters that match no records", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ApplicationWorkspace currentMember={members[0]} members={members} selectedMember={members[0]} applications={[]} applicationNow={applicationNow} permission="own" />);
  expect(screen.getByText("还没有投递记录")).toBeInTheDocument();
  rerender(<ApplicationWorkspace currentMember={members[0]} members={members} selectedMember={members[0]} applications={applications} applicationNow={applicationNow} permission="own" />);
  await user.type(screen.getByLabelText("公司/岗位搜索"), "missing");
  expect(screen.getByText("没有符合筛选条件的记录")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "清除筛选" })).toBeInTheDocument();
});

it("shows unapplied companies only in compatible pending-company filters", async () => {
  const user = userEvent.setup();
  render(
    <ApplicationWorkspace
      currentMember={members[0]}
      members={members}
      selectedMember={members[0]}
      applications={applications}
      applicationNow={applicationNow}
      permission="own"
      companies={[
        { id: "openai", name: "OpenAI", website: "https://openai.com/careers" },
        { id: "anthropic", name: "Anthropic", website: "https://anthropic.com/careers" },
      ]}
    />,
  );
  expect(screen.getByRole("region", { name: "待投递公司" })).toHaveTextContent("Anthropic");
  await user.selectOptions(screen.getByLabelText("阶段"), "面试");
  expect(screen.queryByRole("region", { name: "待投递公司" })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("阶段"), "待投递");
  expect(screen.getByRole("region", { name: "待投递公司" })).toHaveTextContent("Anthropic");
});

it("shows temporary grant controls only while the signed-in member views their own records", () => {
  const { rerender } = render(
    <ApplicationWorkspace
      currentMember={members[0]}
      members={members}
      selectedMember={members[0]}
      applications={applications}
      applicationNow={applicationNow}
      permission="own"
      activeGrants={[]}
    />,
  );
  expect(screen.getByRole("heading", { name: "临时编辑权限" })).toBeInTheDocument();

  rerender(
    <ApplicationWorkspace
      currentMember={members[0]}
      members={members}
      selectedMember={members[1]}
      applications={applications}
      applicationNow={applicationNow}
      permission="readonly"
      activeGrants={[]}
    />,
  );
  expect(screen.queryByRole("heading", { name: "临时编辑权限" })).not.toBeInTheDocument();
});
