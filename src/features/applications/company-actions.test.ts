import { describe, expect, it, vi } from "vitest";
import { deleteSharedCompanyWithDeps, type CompanyActionDependencies } from "./company-actions";

const id = "00000000-0000-4000-8000-000000000001";
function deps(overrides: Partial<CompanyActionDependencies> = {}): CompanyActionDependencies {
  return {
    currentMember: vi.fn().mockResolvedValue({ userId: "member", workspaceId: "workspace", email: "member@example.com", role: "member" }),
    archive: vi.fn().mockResolvedValue({ data: id, error: null }),
    revalidate: vi.fn(),
    ...overrides,
  };
}
describe("shared company deletion", () => {
  it("uses the session workspace, allows ordinary members and revalidates after confirmed success", async () => {
    const operations = deps();
    expect(await deleteSharedCompanyWithDeps(id, operations)).toEqual({ ok: true });
    expect(operations.archive).toHaveBeenCalledWith("workspace", id);
    expect(operations.revalidate).toHaveBeenCalledWith("/");
  });
  it.each([null, "", "other", { id }])("rejects invalid IDs before writes: %j", async (value) => {
    const operations = deps();
    expect(await deleteSharedCompanyWithDeps(value, operations)).toMatchObject({ ok: false });
    expect(operations.archive).not.toHaveBeenCalled();
    expect(operations.revalidate).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: "different-id", error: null },
    { data: id, error: new Error("private database detail") },
  ])("does not report success on missing, unscoped or failed writes", async (response) => {
    const operations = deps({ archive: vi.fn().mockResolvedValue(response) });
    const result = await deleteSharedCompanyWithDeps(id, operations);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain("private database detail");
    expect(operations.revalidate).not.toHaveBeenCalled();
  });
  it("maps network exceptions safely without revalidating", async () => {
    const operations = deps({ archive: vi.fn().mockRejectedValue(new Error("private network detail")) });
    expect(await deleteSharedCompanyWithDeps(id, operations)).toEqual({ ok: false, message: "公司删除失败，请稍后重试" });
    expect(operations.revalidate).not.toHaveBeenCalled();
  });
  it("does not swallow authentication redirects or write without a member", async () => {
    const operations = deps({ currentMember: vi.fn().mockRejectedValue(new Error("NEXT_REDIRECT")) });
    await expect(deleteSharedCompanyWithDeps(id, operations)).rejects.toThrow("NEXT_REDIRECT");
    expect(operations.archive).not.toHaveBeenCalled();
  });
});
