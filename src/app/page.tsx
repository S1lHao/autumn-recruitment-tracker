import { ApplicationWorkspace } from "@/features/applications/application-workspace";
import { hasActiveEditAccess, listApplications, listSharedCompanies, listWorkspaceMembers } from "@/features/applications/queries";
import { signOut } from "@/features/auth/actions";
import { requireMember } from "@/features/auth/authorization";
import { listOwnedActiveGrants } from "@/features/grants/queries";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ member?: string | string[] | undefined }> };

export default async function Page({ searchParams }: PageProps) {
  const currentMember = await requireMember();
  const memberResult = await listWorkspaceMembers();
  if (!memberResult.ok) {
    return <main><h1>秋招协作台</h1><p role="alert">{memberResult.message}</p></main>;
  }
  const members = memberResult.data;
  const currentWorkspaceMember = members.find((member) => member.id === currentMember.userId);
  if (!currentWorkspaceMember) {
    return <main><h1>秋招协作台</h1><p role="alert">成员列表加载失败，请稍后重试</p></main>;
  }
  const params = await searchParams;
  const requestedMemberId = typeof params.member === "string" ? params.member : undefined;
  const selectedMember = members.find((member) => member.id === requestedMemberId) ?? currentWorkspaceMember;
  const renderNow = new Date();
  const isViewingOwnRecords = selectedMember.id === currentMember.userId;
  const [applicationResult, companyResult, grantResult, access] = await Promise.all([
    listApplications(selectedMember.id),
    listSharedCompanies(),
    isViewingOwnRecords ? listOwnedActiveGrants(renderNow) : Promise.resolve(undefined),
    isViewingOwnRecords
      ? Promise.resolve({ ok: true as const, allowed: true })
      : hasActiveEditAccess(currentMember.workspaceId, selectedMember.id, currentMember.userId),
  ]);
  const permission = selectedMember.id === currentMember.userId
    ? "own"
    : access.ok && access.allowed
      ? "temporary"
      : "readonly";
  const loginUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL("/login", process.env.NEXT_PUBLIC_SITE_URL).toString()
    : "/login";
  return (
    <main className="workspace-page">
      <header className="app-header">
        <div className="workspace-brand">
          <span aria-hidden="true" className="workspace-brand-mark">秋</span>
          <div><h1>秋招协作台</h1><p>投递进度 · 伙伴协作</p></div>
        </div>
        <div className="account-actions">
          <div className="account-chip">
            <span aria-hidden="true" className="account-avatar">{currentMember.email.slice(0, 1).toUpperCase()}</span>
            <div><span>当前账号</span><strong>{currentMember.email}</strong></div>
          </div>
          <form action={signOut}><button className="signout-button" type="submit">退出登录</button></form>
        </div>
      </header>
      <ApplicationWorkspace
        currentMember={currentWorkspaceMember}
        members={members}
        selectedMember={selectedMember}
        applications={applicationResult.ok ? applicationResult.data : []}
        companies={companyResult.ok ? companyResult.data : []}
        companyLoadError={companyResult.ok ? undefined : companyResult.message}
        applicationNow={renderNow.toISOString()}
        permission={permission}
        permissionError={access.ok ? undefined : "编辑权限加载失败，请刷新后重试"}
        loadError={applicationResult.ok ? undefined : "申请记录加载失败，请稍后重试"}
        activeGrants={grantResult?.ok ? grantResult.data : undefined}
        grantLoadError={grantResult && !grantResult.ok ? grantResult.message : undefined}
        grantNow={renderNow.toISOString()}
        loginUrl={loginUrl}
      />
    </main>
  );
}
