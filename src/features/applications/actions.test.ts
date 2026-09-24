import { describe, expect, it, vi } from "vitest";
import { createApplicationWithDeps, deleteApplicationWithDeps, updateApplicationWithDeps, type ApplicationActionDependencies } from "./actions";

const member = { userId: "actor", workspaceId: "workspace", email: "actor@example.com", role: "member" as const };
const input = { company: "Example", companyWebsite: "https://example.com", role: "Engineer", location: "", stage: "待投递", appliedOn: "", nextStep: "", deadline: "", notes: "" };

function deps(overrides: Partial<ApplicationActionDependencies> = {}): ApplicationActionDependencies {
  return {
    currentMember: vi.fn().mockResolvedValue(member),
    findWorkspaceMember: vi.fn().mockResolvedValue({ id: "actor", email: "actor@example.com", displayName: "Actor", role: "member" }),
    findApplication: vi.fn().mockResolvedValue({ id: "application", workspaceId: "workspace", ownerId: "actor" }),
    canEditOwner: vi.fn().mockResolvedValue({ ok: true, allowed: true }),
    checkWorkspaceMembership: vi.fn().mockResolvedValue({ ok: true, allowed: true }),
    ensureCompany: vi.fn().mockResolvedValue({ error: null, data: [{ id: "company" }] }),
    create: vi.fn().mockResolvedValue({ error: null, data: [{ id: "application" }] }),
    update: vi.fn().mockResolvedValue({ error: null, data: [{ id: "application" }] }),
    remove: vi.fn().mockResolvedValue({ error: null, data: [{ id: "application" }] }),
    revalidate: vi.fn(),
    ...overrides,
  };
}

describe("application actions", () => {
  it("creates for the current session member and revalidates only after success", async () => {
    const operations = deps();
    await expect(createApplicationWithDeps(input, operations)).resolves.toEqual({ ok: true });
    expect(operations.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace", ownerId: "actor", company: "Example" }));
    expect(operations.ensureCompany).toHaveBeenCalledWith({ workspaceId: "workspace", name: "Example", website: "https://example.com" });
    expect(operations.revalidate).toHaveBeenCalledWith("/");
  });

  it("validates a delegated same-workspace target before an active DB-grant insert", async () => {
    const operations = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, operations)).resolves.toEqual({ ok: true });
    expect(operations.findWorkspaceMember).toHaveBeenCalledWith("workspace", "teammate");
    expect(operations.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "teammate" }));
  });

  it("returns a safe failure when a delegated insert is rejected by RLS", async () => {
    const operations = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      create: vi.fn().mockResolvedValue({ error: new Error("RLS denied") }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, operations)).resolves.toEqual({ ok: false, message: "申请记录保存失败，请稍后重试" });
    expect(operations.revalidate).not.toHaveBeenCalled();
  });

  it("does not persist teammate records without an active grant, but permits an active grant", async () => {
    const denied = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn().mockResolvedValue({ ok: true, allowed: false }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, denied)).resolves.toEqual({ ok: false, message: "你没有编辑该成员记录的权限", code: "PERMISSION_DENIED" });
    expect(denied.create).not.toHaveBeenCalled();
    expect(denied.revalidate).not.toHaveBeenCalled();

    const deniedUpdate = deps({
      findApplication: vi.fn().mockResolvedValue({ id: "application", workspaceId: "workspace", ownerId: "teammate" }),
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn().mockResolvedValue({ ok: true, allowed: false }),
    });
    await expect(updateApplicationWithDeps("application", input, deniedUpdate)).resolves.toEqual({ ok: false, message: "你没有编辑该成员记录的权限", code: "PERMISSION_DENIED" });
    expect(deniedUpdate.update).not.toHaveBeenCalled();
    expect(deniedUpdate.revalidate).not.toHaveBeenCalled();

    const granted = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn().mockResolvedValue({ ok: true, allowed: true }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, granted)).resolves.toEqual({ ok: true });
    expect(granted.canEditOwner).toHaveBeenCalledWith("workspace", "teammate", "actor");
    expect(granted.create).toHaveBeenCalled();
  });

  it("denies outsider targets and validation failures before writes", async () => {
    const operations = deps({ findWorkspaceMember: vi.fn().mockResolvedValue(null) });
    await expect(createApplicationWithDeps({ ...input, ownerId: "outsider" }, operations)).resolves.toEqual({ ok: false, message: "目标成员不在当前工作区" });
    expect(operations.create).not.toHaveBeenCalled();
    await expect(createApplicationWithDeps({ ...input, company: " " }, deps())).resolves.toMatchObject({ ok: false, fieldErrors: { company: expect.any(Array) } });
  });

  it("keeps application identity on update and denies teammate deletion before the database", async () => {
    const updateOperations = deps();
    await expect(updateApplicationWithDeps("application", { ...input, ownerId: "other", workspaceId: "other" }, updateOperations)).resolves.toEqual({ ok: true });
    expect(updateOperations.findWorkspaceMember).toHaveBeenCalledWith("workspace", "actor");
    expect(updateOperations.update).toHaveBeenCalledWith(
      { id: "application", workspaceId: "workspace", ownerId: "actor" },
      expect.not.objectContaining({ ownerId: expect.anything(), workspaceId: expect.anything() }),
    );

    const deleteOperations = deps({ findApplication: vi.fn().mockResolvedValue({ id: "application", workspaceId: "workspace", ownerId: "teammate" }) });
    await expect(deleteApplicationWithDeps("application", deleteOperations)).resolves.toEqual({ ok: false, message: "只能删除自己的申请记录", code: "PERMISSION_DENIED" });
    expect(deleteOperations.remove).not.toHaveBeenCalled();
  });

  it("maps database errors safely and does not revalidate failed mutations", async () => {
    const operations = deps({ create: vi.fn().mockResolvedValue({ error: new Error("rls details") }) });
    await expect(createApplicationWithDeps(input, operations)).resolves.toEqual({ ok: false, message: "申请记录保存失败，请稍后重试" });
    expect(operations.revalidate).not.toHaveBeenCalled();
  });

  it("does not create an application when the shared company cannot be saved", async () => {
    const operations = deps({ ensureCompany: vi.fn().mockResolvedValue({ error: new Error("db"), data: null }) });
    await expect(createApplicationWithDeps(input, operations)).resolves.toEqual({ ok: false, message: "公司信息保存失败，请稍后重试" });
    expect(operations.create).not.toHaveBeenCalled();
    expect(operations.revalidate).not.toHaveBeenCalled();
  });

  it("returns a stable permission code when a grant is revoked between precheck and write", async () => {
    const createOperations = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn().mockResolvedValueOnce({ ok: true, allowed: true }).mockResolvedValueOnce({ ok: true, allowed: false }),
      create: vi.fn().mockResolvedValue({ error: new Error("RLS denied"), data: null }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, createOperations)).resolves.toEqual({
      ok: false,
      message: "你没有编辑该成员记录的权限",
      code: "PERMISSION_DENIED",
    });
    expect(createOperations.canEditOwner).toHaveBeenCalledTimes(2);
    expect(createOperations.revalidate).not.toHaveBeenCalled();

    const updateOperations = deps({
      findApplication: vi.fn().mockResolvedValue({ id: "application", workspaceId: "workspace", ownerId: "teammate" }),
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn().mockResolvedValueOnce({ ok: true, allowed: true }).mockResolvedValueOnce({ ok: true, allowed: false }),
      update: vi.fn().mockRejectedValue(new Error("RLS denied")),
    });
    await expect(updateApplicationWithDeps("application", input, updateOperations)).resolves.toEqual({
      ok: false,
      message: "你没有编辑该成员记录的权限",
      code: "PERMISSION_DENIED",
    });
    expect(updateOperations.canEditOwner).toHaveBeenCalledTimes(2);
    expect(updateOperations.revalidate).not.toHaveBeenCalled();
  });

  it("classifies a failed owner delete as permission loss when workspace membership disappeared", async () => {
    const operations = deps({
      checkWorkspaceMembership: vi.fn().mockResolvedValue({ ok: true, allowed: false }),
      remove: vi.fn().mockResolvedValue({ error: new Error("RLS denied"), data: null }),
    });
    await expect(deleteApplicationWithDeps("application", operations)).resolves.toEqual({
      ok: false,
      message: "你没有编辑该成员记录的权限",
      code: "PERMISSION_DENIED",
    });
    expect(operations.checkWorkspaceMembership).toHaveBeenCalledWith("workspace", "actor");
  });

  it("keeps retryable mutation errors when permission rechecks fail or still allow access", async () => {
    const lookupFailed = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn()
        .mockResolvedValueOnce({ ok: true, allowed: true })
        .mockResolvedValueOnce({ ok: false }),
      create: vi.fn().mockResolvedValue({ error: new Error("network"), data: null }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, lookupFailed)).resolves.toEqual({
      ok: false,
      message: "申请记录保存失败，请稍后重试",
    });

    const stillAllowed = deps({
      findApplication: vi.fn().mockResolvedValue({ id: "application", workspaceId: "workspace", ownerId: "teammate" }),
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn()
        .mockResolvedValueOnce({ ok: true, allowed: true })
        .mockResolvedValueOnce({ ok: true, allowed: true }),
      update: vi.fn().mockRejectedValue(new Error("network")),
    });
    await expect(updateApplicationWithDeps("application", input, stillAllowed)).resolves.toEqual({
      ok: false,
      message: "申请记录保存失败，请稍后重试",
    });

    const deleteLookupFailed = deps({
      checkWorkspaceMembership: vi.fn().mockResolvedValue({ ok: false }),
      remove: vi.fn().mockResolvedValue({ error: new Error("network"), data: null }),
    });
    await expect(deleteApplicationWithDeps("application", deleteLookupFailed)).resolves.toEqual({
      ok: false,
      message: "申请记录删除失败，请稍后重试",
    });
  });

  it("returns a retryable error when the initial edit-permission lookup fails", async () => {
    const operations = deps({
      findWorkspaceMember: vi.fn().mockResolvedValue({ id: "teammate", email: "t@example.com", displayName: "T", role: "member" }),
      canEditOwner: vi.fn().mockResolvedValue({ ok: false }),
    });
    await expect(createApplicationWithDeps({ ...input, ownerId: "teammate" }, operations)).resolves.toEqual({
      ok: false,
      message: "编辑权限检查失败，请稍后重试",
    });
    expect(operations.create).not.toHaveBeenCalled();
  });

  it("does not accept an RLS-filtered create with zero returned rows", async () => {
    const operations = deps({ create: vi.fn().mockResolvedValue({ error: null, data: [] }) });
    await expect(createApplicationWithDeps(input, operations)).resolves.toEqual({ ok: false, message: "申请记录保存失败，请稍后重试" });
    expect(operations.revalidate).not.toHaveBeenCalled();
  });

  it("does not accept an RLS-filtered update or delete with zero returned rows", async () => {
    const updateOperations = deps({ update: vi.fn().mockResolvedValue({ error: null, data: [] }) });
    await expect(updateApplicationWithDeps("application", input, updateOperations)).resolves.toEqual({ ok: false, message: "申请记录保存失败，请稍后重试" });
    expect(updateOperations.revalidate).not.toHaveBeenCalled();

    const deleteOperations = deps({ remove: vi.fn().mockResolvedValue({ error: null, data: [] }) });
    await expect(deleteApplicationWithDeps("application", deleteOperations)).resolves.toEqual({ ok: false, message: "申请记录删除失败，请稍后重试" });
    expect(deleteOperations.revalidate).not.toHaveBeenCalled();
  });

  it("revalidates only when update and delete each return one matching id", async () => {
    const updateOperations = deps({ update: vi.fn().mockResolvedValue({ error: null, data: [{ id: "application" }] }) });
    await expect(updateApplicationWithDeps("application", input, updateOperations)).resolves.toEqual({ ok: true });
    expect(updateOperations.revalidate).toHaveBeenCalledWith("/");

    const deleteOperations = deps({ remove: vi.fn().mockResolvedValue({ error: null, data: [{ id: "application" }] }) });
    await expect(deleteApplicationWithDeps("application", deleteOperations)).resolves.toEqual({ ok: true });
    expect(deleteOperations.revalidate).toHaveBeenCalledWith("/");
  });
});
