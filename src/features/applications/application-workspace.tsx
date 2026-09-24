"use client";

import { useMemo, useState } from "react";
import { InviteMemberForm } from "@/features/auth/invite-member-form";
import { GrantPanel } from "@/features/grants/grant-panel";
import type { EditGrant } from "@/features/grants/schemas";
import { ApplicationFilters, EMPTY_APPLICATION_FILTERS } from "./application-filters";
import { ApplicationTable } from "./application-table";
import { PermissionBadge } from "./empty-state";
import { filterApplications, type ApplicationFilterValues } from "./filter-applications";
import { MemberSwitcher } from "./member-switcher";
import { SummaryCards } from "./summary-cards";
import type { Application, SharedCompany, WorkspaceMember } from "./types";

export type WorkspacePermission = "own" | "readonly" | "temporary";

export function ApplicationWorkspace({
  currentMember,
  members,
  selectedMember,
  applications,
  companies = [],
  companyLoadError,
  applicationNow,
  permission,
  permissionError,
  loadError,
  activeGrants,
  grantLoadError,
  grantNow,
  loginUrl,
}: {
  currentMember: WorkspaceMember;
  members: readonly WorkspaceMember[];
  selectedMember: WorkspaceMember;
  applications: readonly Application[];
  companies?: readonly SharedCompany[];
  companyLoadError?: string;
  applicationNow: string;
  permission: WorkspacePermission;
  permissionError?: string;
  loadError?: string;
  activeGrants?: readonly EditGrant[];
  grantLoadError?: string;
  grantNow?: string;
  loginUrl?: string;
}) {
  const [filters, setFilters] = useState<ApplicationFilterValues>(EMPTY_APPLICATION_FILTERS);
  const [revokedOwnerId, setRevokedOwnerId] = useState<string | null>(null);
  const visibleApplications = useMemo(() => filterApplications(applications, filters), [applications, filters]);
  const effectivePermission = permission === "temporary" && revokedOwnerId === selectedMember.id ? "readonly" : permission;
  const deadlineNow = useMemo(() => new Date(applicationNow), [applicationNow]);
  return (
    <section aria-label="申请记录工作区" className="workspace">
      <div className="workspace-toolbar">
        <div className="workspace-view-heading"><p className="panel-eyebrow">WORKSPACE VIEW</p><h2>成员视图</h2></div>
        <MemberSwitcher members={members} selectedMember={selectedMember} />
        <PermissionBadge mode={effectivePermission} />
        {permissionError ? <p className="inline-alert" role="alert"><span aria-hidden="true">!</span> {permissionError}</p> : null}
      </div>
      {loadError ? <section className="state-card state-card-error"><p role="alert"><span aria-hidden="true">!</span> {loadError}</p><a className="button-link" href={`?${new URLSearchParams({ member: selectedMember.id }).toString()}`}>重试</a></section> : (
        <>
          <SummaryCards applications={applications} />
          <ApplicationFilters filters={filters} onChange={setFilters} showClear={visibleApplications.length > 0} />
          <section aria-label="申请记录列表" className="application-list-section">
            <div className="section-heading"><div><p className="panel-eyebrow">APPLICATION PIPELINE</p><h2>投递记录</h2></div><p className="record-count">共 {visibleApplications.length} 条</p></div>
            <ApplicationTable
              allApplications={applications}
              applications={visibleApplications}
              companies={companies}
              companyLoadError={companyLoadError}
              emptyStateKind={applications.length === 0 ? "empty" : "filtered"}
              key={selectedMember.id}
              now={deadlineNow}
              onClearEmptyState={() => setFilters(EMPTY_APPLICATION_FILTERS)}
              onPermissionRevoked={() => setRevokedOwnerId(selectedMember.id)}
              onSort={(sortBy, sortDirection) => setFilters((current) => ({ ...current, sortBy, sortDirection }))}
              permission={effectivePermission}
              pendingCompanySearch={filters.search}
              selectedMember={selectedMember}
              showPendingCompanies={
                (filters.stage === "all" || filters.stage === "待投递")
                && !filters.location?.trim()
                && filters.deadline === "all"
              }
              sortBy={filters.sortBy}
              sortDirection={filters.sortDirection}
            />
          </section>
        </>
      )}
      <section aria-label="协作管理" className="collaboration-section">
        <div className="section-heading"><div><p className="panel-eyebrow">COLLABORATION</p><h2>协作管理</h2></div><p>邀请成员，并按需开放临时编辑权限。</p></div>
        <div className="collaboration-grid">
          {currentMember.role === "admin" ? <section className="panel invite-panel"><div className="panel-heading"><div><p className="panel-eyebrow">TEAM ACCESS</p><h2>邀请成员</h2></div><p>成员只能查看工作台；编辑他人记录仍需单独授权。</p></div><InviteMemberForm role={currentMember.role} loginUrl={loginUrl} /></section> : null}
          {currentMember.id === selectedMember.id ? (
            <GrantPanel
              activeGrants={activeGrants}
              loadError={grantLoadError}
              members={members}
              ownerId={currentMember.id}
              initialNow={grantNow}
            />
          ) : null}
        </div>
      </section>
    </section>
  );
}
