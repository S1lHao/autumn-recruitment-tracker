"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMember, type CurrentMember } from "@/features/auth/authorization";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/features/shared/result";

export type CompanyActionDependencies = {
  currentMember: () => Promise<CurrentMember>;
  archive: (workspaceId: string, companyId: string) => Promise<{ data: unknown; error: unknown }>;
  revalidate: (path: string) => void;
};

export async function deleteSharedCompanyWithDeps(companyId: unknown, dependencies: CompanyActionDependencies): Promise<ActionResult> {
  // Authentication redirects are intentionally not swallowed.
  const member = await dependencies.currentMember();
  if (!z.string().uuid().safeParse(companyId).success) return { ok: false, message: "公司信息无效，请刷新后重试" };
  try {
    const response = await dependencies.archive(member.workspaceId, companyId as string);
    if (response.error || response.data !== companyId) return { ok: false, message: "公司删除失败，可能已不存在或没有访问权限，请刷新后重试" };
    dependencies.revalidate("/");
    return { ok: true };
  } catch {
    return { ok: false, message: "公司删除失败，请稍后重试" };
  }
}

export async function deleteSharedCompany(companyId: string): Promise<ActionResult> {
  return deleteSharedCompanyWithDeps(companyId, {
    currentMember: requireMember,
    async archive(workspaceId, id) {
      const supabase = await createServerClient();
      return supabase.rpc("archive_workspace_company", { target_workspace_id: workspaceId, target_company_id: id });
    },
    revalidate: revalidatePath,
  });
}
