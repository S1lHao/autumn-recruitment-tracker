import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));

vi.mock("./actions", () => actions);

import { ApplicationTable, deadlinePresentation } from "./application-table";
import type { Application, SharedCompany, WorkspaceMember } from "./types";

const selectedMember: WorkspaceMember = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "me@example.com",
  displayName: "我",
  role: "member",
};

const application: Application = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "workspace",
  ownerId: selectedMember.id,
  company: "OpenAI",
  role: "前端工程师",
  location: "上海",
  stage: "面试",
  appliedOn: "2026-09-01",
  nextStep: "准备算法",
  deadline: "2026-09-10T12:00:00.000Z",
  jobUrl: "https://example.com/job",
  notes: "朋友内推",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
};

const editableFixture = {
  applications: [application],
  permission: "own" as const,
  selectedMember,
  now: new Date("2026-09-07T12:00:00.000Z"),
};

const readOnlyFixture = { ...editableFixture, permission: "readonly" as const };

const sharedCompanies: SharedCompany[] = [
  { id: "openai", name: "OpenAI", website: "https://openai.com/careers" },
  { id: "anthropic", name: "Anthropic", website: "https://www.anthropic.com/careers" },
];

type MediaListener = (event: MediaQueryListEvent) => void;
let mediaMatches = false;
const mediaListeners = new Set<MediaListener>();

function setMobile(matches: boolean) {
  mediaMatches = matches;
  for (const listener of mediaListeners) listener({ matches, media: "(max-width: 767px)" } as MediaQueryListEvent);
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.createApplication.mockResolvedValue({ ok: true });
  actions.updateApplication.mockResolvedValue({ ok: true });
  actions.deleteApplication.mockResolvedValue({ ok: true });
  mediaMatches = false;
  mediaListeners.clear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mediaMatches,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => mediaListeners.delete(listener),
    addListener: (listener: MediaListener) => mediaListeners.add(listener),
    removeListener: (listener: MediaListener) => mediaListeners.delete(listener),
    dispatchEvent: () => true,
  }));
});

it("keeps edited input when save fails and offers retry", async () => {
  actions.updateApplication.mockResolvedValue({ ok: false, message: "保存失败，请重试" });
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  await user.click(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" }));
  await user.clear(screen.getByLabelText("下一步"));
  await user.type(screen.getByLabelText("下一步"), "准备系统设计");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByDisplayValue("准备系统设计")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
});

it("announces a successful save in one polite live region", async () => {
  const user = userEvent.setup();
  const { container } = render(<ApplicationTable {...editableFixture} />);
  const initialStatus = screen.getByRole("status");
  expect(initialStatus).toHaveAttribute("aria-live", "polite");
  expect(initialStatus).toHaveAttribute("aria-atomic", "true");
  expect(initialStatus).toBeEmptyDOMElement();
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByText("申请记录已保存")).toBeInTheDocument();
  expect(screen.getByRole("status")).toBe(initialStatus);
  expect(initialStatus).toHaveTextContent("申请记录已保存");
  expect(screen.getAllByText("申请记录已保存")).toHaveLength(1);
});

it("does not render edit or delete controls in read-only mode", () => {
  render(<ApplicationTable {...readOnlyFixture} />);
  expect(screen.queryByRole("button", { name: /编辑/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
});

it("lets a temporary editor create and edit but not delete", () => {
  render(<ApplicationTable {...editableFixture} permission="temporary" />);
  expect(screen.getByRole("button", { name: "新增申请" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
});

it("replaces the empty state with a full create editor and restores it after cancelling", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} applications={[]} />);
  expect(screen.getByText("还没有投递记录")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "新增申请" }));
  expect(screen.getByRole("heading", { name: "新增投递记录" })).toBeInTheDocument();
  expect(screen.getByLabelText("投递日期")).toHaveValue("2026-09-07");
  expect(screen.queryByText("还没有投递记录")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByText("还没有投递记录")).toBeInTheDocument();
});

it("reuses a shared company and fills its website while still accepting a new company", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} companies={[{ id: "company", name: "Example", website: "https://example.com" }]} />);
  await user.click(screen.getByRole("button", { name: "新增申请" }));

  await user.click(screen.getByRole("button", { name: "展开共享公司库" }));
  expect(screen.getByRole("listbox", { name: "共享公司库" })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: /Example/ }));
  expect(screen.getByLabelText("公司官网")).toHaveValue("https://example.com");

  await user.clear(screen.getByLabelText("公司"));
  await user.type(screen.getByLabelText("公司"), "New Company");
  expect(screen.getByLabelText("公司官网")).toHaveValue("");
});

it("turns only unapplied shared companies into pending tasks", () => {
  render(
    <ApplicationTable
      {...editableFixture}
      allApplications={[application]}
      applications={[]}
      companies={sharedCompanies}
    />,
  );
  const pending = screen.getByRole("region", { name: "待投递公司" });
  expect(within(pending).getByText("Anthropic")).toBeInTheDocument();
  expect(within(pending).queryByText("OpenAI")).not.toBeInTheDocument();
  expect(within(pending).getByText("共 1 家")).toBeInTheDocument();
  expect(screen.queryByText("还没有投递记录")).not.toBeInTheDocument();
});

it("prefills the company and website when adding a role from a pending task", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} companies={sharedCompanies} />);
  await user.click(screen.getByRole("button", { name: "为 Anthropic 添加岗位" }));
  expect(screen.getByRole("heading", { name: "新增投递记录" })).toBeInTheDocument();
  expect(screen.getByLabelText("公司")).toHaveValue("Anthropic");
  expect(screen.getByLabelText("公司官网")).toHaveValue("https://www.anthropic.com/careers");
  expect(screen.getByLabelText("投递日期")).toHaveValue("2026-09-07");
});

it("shows company websites for existing records and pending tasks on desktop and mobile", async () => {
  render(<ApplicationTable {...editableFixture} companies={sharedCompanies} />);
  expect(screen.getByRole("link", { name: "访问 OpenAI 官网" })).toHaveAttribute("href", "https://openai.com/careers");
  expect(screen.getByRole("link", { name: "访问 Anthropic 官网" })).toHaveTextContent("anthropic.com");

  await act(async () => setMobile(true));
  expect(screen.getByRole("link", { name: "访问 OpenAI 官网" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "为 Anthropic 添加岗位" })).toBeInTheDocument();
});

it("keeps pending company websites visible without edit controls in readonly mode", () => {
  render(<ApplicationTable {...readOnlyFixture} companies={sharedCompanies} />);
  expect(screen.getByRole("link", { name: "访问 Anthropic 官网" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "为 Anthropic 添加岗位" })).not.toBeInTheDocument();
});

it("keeps the company picker visible when the shared library is empty", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} applications={[]} />);
  await user.click(screen.getByRole("button", { name: "新增申请" }));

  await user.click(screen.getByRole("button", { name: "展开共享公司库" }));
  expect(screen.getByText("共享公司库暂无公司，保存后会自动加入")).toBeInTheDocument();
  expect(screen.getByText("输入公司名称，保存后自动加入共享公司库")).toBeInTheDocument();
});

it("shows field errors in place and focuses the error summary", async () => {
  actions.updateApplication.mockResolvedValue({
    ok: false,
    message: "请检查申请信息",
    fieldErrors: { company: ["此项不能为空"] },
  });
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  await user.click(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" }));
  await user.clear(screen.getByLabelText("公司"));
  await user.click(screen.getByRole("button", { name: "保存" }));
  const summary = await screen.findByRole("alert", { name: "保存失败" });
  expect(summary).toHaveFocus();
  expect(screen.getByText("此项不能为空")).toBeInTheDocument();
  expect(screen.getByLabelText("公司")).toHaveAttribute("aria-invalid", "true");
});

it("waits for confirmed deletion and names the company and role", async () => {
  let resolveDelete: (value: { ok: true }) => void = () => undefined;
  actions.deleteApplication.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  await user.click(screen.getByRole("button", { name: "删除 OpenAI 前端工程师" }));
  const dialog = screen.getByRole("dialog", { name: "确认删除申请" });
  expect(dialog).toHaveTextContent("OpenAI");
  expect(dialog).toHaveTextContent("前端工程师");
  await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
  expect(screen.getByText("OpenAI")).toBeInTheDocument();
  resolveDelete({ ok: true });
  expect(await screen.findByText("还没有投递记录")).toBeInTheDocument();
});

it("hides legacy job links and exposes deadline status and sortable header state", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ApplicationTable {...readOnlyFixture} />);
  expect(screen.queryByText("岗位链接")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "查看 OpenAI 前端工程师岗位" })).not.toBeInTheDocument();
  expect(screen.getByText(/7 天内/)).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "公司" })).toHaveAttribute("aria-sort", "none");
  await user.click(screen.getByRole("button", { name: "按公司排序" }));
  expect(screen.getByRole("columnheader", { name: "公司 ↑" })).toHaveAttribute("aria-sort", "ascending");

  rerender(<ApplicationTable {...readOnlyFixture} applications={[{ ...application, deadline: "2026-09-01T00:00:00.000Z" }]} />);
  expect(screen.getByText(/已逾期/)).toBeInTheDocument();
});

it("autosaves stage, next step, and deadline from the record row", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} companies={sharedCompanies} />);

  await user.selectOptions(screen.getByLabelText("更新 OpenAI 前端工程师 当前进度"), "Offer");
  expect(actions.updateApplication).toHaveBeenCalledTimes(1);
  let submitted = actions.updateApplication.mock.calls[0]?.[1] as FormData;
  expect(submitted.get("stage")).toBe("Offer");
  expect(submitted.get("company")).toBe("OpenAI");
  expect(submitted.get("companyWebsite")).toBe("https://openai.com/careers");
  expect(await screen.findByText("已保存")).toBeInTheDocument();

  const nextStep = screen.getByLabelText("更新 OpenAI 前端工程师 下一步");
  await user.clear(nextStep);
  await user.type(nextStep, "等待二面通知");
  await user.tab();
  expect(actions.updateApplication).toHaveBeenCalledTimes(2);
  submitted = actions.updateApplication.mock.calls[1]?.[1] as FormData;
  expect(submitted.get("nextStep")).toBe("等待二面通知");

  const deadline = screen.getByLabelText("更新 OpenAI 前端工程师 截止时间");
  fireEvent.change(deadline, { target: { value: "2026-09-20T18:30" } });
  expect(actions.updateApplication).toHaveBeenCalledTimes(3);
  submitted = actions.updateApplication.mock.calls[2]?.[1] as FormData;
  expect(submitted.get("deadline")).toBe("2026-09-20T10:30:00.000Z");
});

it("renders deadlines in Asia/Shanghai independently of the server or browser timezone", () => {
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const serverRender = deadlinePresentation("2026-09-10T12:00:00.000Z", editableFixture.now).label;
    process.env.TZ = "America/Los_Angeles";
    const clientHydration = deadlinePresentation("2026-09-10T12:00:00.000Z", editableFixture.now).label;
    expect(serverRender).toBe("7 天内 · 09/10 20:00");
    expect(clientHydration).toBe(serverRender);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

it("moves focus into editors and restores it when cancelled", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  const trigger = screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" });
  await user.click(trigger);
  expect(screen.getByLabelText("公司")).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" })).toHaveFocus();
});

it("keeps one draft and one mutation lock while switching to mobile", async () => {
  let resolveUpdate: (value: { ok: true }) => void = () => undefined;
  actions.updateApplication.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  await user.click(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" }));
  await user.clear(screen.getByLabelText("下一步"));
  await user.type(screen.getByLabelText("下一步"), "准备共享草稿");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await act(async () => setMobile(true));
  expect(document.querySelector(".applications-desktop")).not.toBeInTheDocument();
  expect(document.querySelector(".applications-mobile")).toBeInTheDocument();
  expect(await screen.findByDisplayValue("准备共享草稿")).toBeInTheDocument();
  expect(screen.getByLabelText("公司")).toHaveFocus();
  expect(screen.getByRole("button", { name: "正在保存…" })).toBeDisabled();
  expect(actions.updateApplication).toHaveBeenCalledTimes(1);
  resolveUpdate({ ok: true });
  expect(await screen.findByRole("button", { name: "编辑 OpenAI 前端工程师" })).toBeInTheDocument();
});

it("makes the delete dialog modal, keyboard dismissible, and restores focus", async () => {
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  const trigger = screen.getByRole("button", { name: "删除 OpenAI 前端工程师" });
  await user.click(trigger);
  const cancel = screen.getByRole("button", { name: "取消删除" });
  const confirm = screen.getByRole("button", { name: "确认删除" });
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  expect(cancel).toHaveFocus();
  await user.tab();
  expect(confirm).toHaveFocus();
  await user.tab({ shift: true });
  expect(cancel).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("does not reopen the native modal when pending and error state rerender it", async () => {
  let resolveDelete: (value: { ok: false; message: string }) => void = () => undefined;
  actions.deleteApplication.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  try {
    const user = userEvent.setup();
    render(<ApplicationTable {...editableFixture} />);
    await user.click(screen.getByRole("button", { name: "删除 OpenAI 前端工程师" }));
    expect(showModal).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(showModal).toHaveBeenCalledOnce();
    resolveDelete({ ok: false, message: "删除失败，请重试" });
    expect(await screen.findByRole("alert")).toHaveTextContent("删除失败，请重试");
    expect(showModal).toHaveBeenCalledOnce();
  } finally {
    if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: originalShowModal });
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  }
});

it("switches a temporary editor to readonly using a stable permission error code", async () => {
  actions.updateApplication.mockResolvedValue({ ok: false, message: "你没有编辑该成员记录的权限", code: "PERMISSION_DENIED" });
  const onPermissionRevoked = vi.fn();
  const user = userEvent.setup();
  const { container } = render(<ApplicationTable {...editableFixture} onPermissionRevoked={onPermissionRevoked} permission="temporary" />);
  const initialStatus = screen.getByRole("status");
  await user.click(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  const status = await screen.findByRole("status");
  expect(status).toBe(initialStatus);
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(status).toHaveTextContent("你没有编辑该成员记录的权限");
  const readonlyRegion = screen.getByRole("region", { name: "申请记录操作区，当前为只读" });
  expect(readonlyRegion).toHaveAttribute("tabindex", "-1");
  expect(readonlyRegion).toHaveFocus();
  expect(readonlyRegion).not.toBe(status);
  expect(screen.queryByRole("button", { name: /编辑/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "新增申请" })).not.toBeInTheDocument();
  expect(onPermissionRevoked).toHaveBeenCalledOnce();
});

it("keeps a temporary editor and its draft when the permission recheck itself fails", async () => {
  actions.updateApplication.mockResolvedValue({ ok: false, message: "编辑权限检查失败，请稍后重试" });
  const onPermissionRevoked = vi.fn();
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} onPermissionRevoked={onPermissionRevoked} permission="temporary" />);
  await user.click(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" }));
  await user.clear(screen.getByLabelText("下一步"));
  await user.type(screen.getByLabelText("下一步"), "保留这份草稿");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByDisplayValue("保留这份草稿")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新增申请" })).toBeInTheDocument();
  expect(onPermissionRevoked).not.toHaveBeenCalled();
});

it("labels the keyboard-focusable horizontal table region", () => {
  render(<ApplicationTable {...editableFixture} />);
  const scrollRegion = screen.getByRole("region", { name: "申请记录表格，可横向和纵向滚动" });
  expect(scrollRegion).toHaveAttribute("tabindex", "0");
  expect(scrollRegion).toHaveClass("application-table-scroll");
});

it("supports mobile edit focus and clears an old delete error before reopening", async () => {
  setMobile(true);
  actions.deleteApplication.mockResolvedValue({ ok: false, message: "删除失败，请重试" });
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} />);
  expect(screen.getByRole("article")).toHaveTextContent("OpenAI");
  const edit = screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" });
  await user.click(edit);
  expect(screen.getByLabelText("公司")).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByRole("button", { name: "编辑 OpenAI 前端工程师" })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "删除 OpenAI 前端工程师" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("删除失败，请重试");
  await user.click(screen.getByRole("button", { name: "取消删除" }));
  await user.click(screen.getByRole("button", { name: "删除 OpenAI 前端工程师" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps the selected owner when a temporary editor creates from mobile", async () => {
  setMobile(true);
  const user = userEvent.setup();
  render(<ApplicationTable {...editableFixture} permission="temporary" />);
  await user.click(screen.getByRole("button", { name: "新增申请" }));
  await user.type(screen.getByLabelText("公司"), "Anthropic");
  await user.type(screen.getByLabelText("岗位"), "产品工程师");
  await user.click(screen.getByRole("button", { name: "保存" }));
  const submitted = actions.createApplication.mock.calls[0]?.[0] as FormData;
  expect(submitted.get("ownerId")).toBe(selectedMember.id);
});
