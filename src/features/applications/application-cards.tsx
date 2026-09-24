"use client";

import type { ActionResult } from "@/features/shared/result";
import { ApplicationForm, applicationDraftToFormData, type ApplicationDraft } from "./application-form";
import { companyWebsiteFor, companyWebsiteLabel } from "./company-catalog";
import { InlineApplicationFields } from "./inline-application-fields";
import type { Application, SharedCompany } from "./types";
import type { WorkspacePermission } from "./application-workspace";

export function CompanyWebsiteLink({ companyName, companies }: {
  companyName: string;
  companies: readonly SharedCompany[];
}) {
  const website = companyWebsiteFor(companyName, companies);
  if (!website) return <>—</>;
  return (
    <a
      aria-label={`访问 ${companyName} 官网`}
      className="company-website-link"
      href={website}
      rel="noreferrer noopener"
      target="_blank"
      title={website}
    >{companyWebsiteLabel(website)}</a>
  );
}

export type ApplicationCardsProps = {
  applications: readonly Application[];
  companies: readonly SharedCompany[];
  pendingCompanies: readonly SharedCompany[];
  permission: WorkspacePermission;
  ownerId: string;
  now: Date;
  creating: boolean;
  editingId: string | null;
  draft: ApplicationDraft;
  formResult: ActionResult | null;
  isMutating: boolean;
  showEmptyState: boolean;
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (applicationId: string, formData: FormData) => Promise<ActionResult>;
  onCancelEditor: () => void;
  onDraftChange: (draft: ApplicationDraft) => void;
  onFormResult: (result: ActionResult) => void;
  onFormSuccess: () => void;
  onRequestDelete: (application: Application, focusKey: string) => void;
  onStartCreate: (focusKey: string) => void;
  onStartCreateForCompany: (company: SharedCompany, focusKey: string) => void;
  onStartEdit: (application: Application, focusKey: string) => void;
};

export function PendingCompanyTasks({
  companies,
  canEdit,
  isMutating,
  onStartCreate,
}: {
  companies: readonly SharedCompany[];
  canEdit: boolean;
  isMutating: boolean;
  onStartCreate: (company: SharedCompany, focusKey: string) => void;
}) {
  if (companies.length === 0) return null;
  return (
    <section aria-labelledby="pending-company-title" className="pending-company-tasks">
      <header>
        <div>
          <p className="panel-eyebrow">COMPANY WATCHLIST</p>
          <h3 id="pending-company-title">待投递公司</h3>
        </div>
        <span>共 {companies.length} 家</span>
      </header>
      <p className="pending-company-description">来自共享公司库，添加岗位后会自动进入你的投递记录。</p>
      <div className="pending-company-grid">
        {companies.map((company) => (
          <article className="pending-company-card" key={company.id}>
            <div>
              <h4>{company.name}</h4>
              <p>尚未添加岗位</p>
            </div>
            <div className="pending-company-actions">
              {company.website ? (
                <a aria-label={`访问 ${company.name} 官网`} href={company.website} rel="noreferrer noopener" target="_blank" title={company.website}>
                  {companyWebsiteLabel(company.website)}
                </a>
              ) : <span>暂无官网</span>}
              {canEdit ? (
                <button
                  aria-label={`为 ${company.name} 添加岗位`}
                  data-focus-key={`pending-${company.id}`}
                  disabled={isMutating}
                  onClick={() => onStartCreate(company, `pending-${company.id}`)}
                  type="button"
                >添加岗位</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ApplicationCards({
  applications,
  companies,
  pendingCompanies,
  permission,
  ownerId,
  now,
  creating,
  editingId,
  draft,
  formResult,
  isMutating,
  showEmptyState,
  createAction,
  updateAction,
  onCancelEditor,
  onDraftChange,
  onFormResult,
  onFormSuccess,
  onRequestDelete,
  onStartCreate,
  onStartCreateForCompany,
  onStartEdit,
}: ApplicationCardsProps) {
  const canEdit = permission === "own" || permission === "temporary";
  const canDelete = permission === "own";
  return (
    <div className="applications-mobile">
      {canEdit ? (!creating ? (
        <button data-focus-key="create" disabled={isMutating} onClick={() => onStartCreate("create")} type="button"><span aria-hidden="true">＋</span>新增申请</button>
      ) : (
        <ApplicationForm action={createAction} companies={companies} draft={draft} formId="cards-create-application" isPending={isMutating} onCancel={onCancelEditor} onDraftChange={onDraftChange} onResult={onFormResult} onSuccess={onFormSuccess} ownerId={ownerId} result={formResult} title="新增投递记录" />
      )) : null}
      <PendingCompanyTasks companies={pendingCompanies} canEdit={canEdit} isMutating={isMutating} onStartCreate={onStartCreateForCompany} />
      <div className="application-card-list">
        {applications.map((application) => (
          <article className="application-card" key={application.id}>
            {editingId === application.id ? (
              <ApplicationForm action={(formData) => updateAction(application.id, formData)} companies={companies} draft={draft} formId={`cards-edit-${application.id}`} isPending={isMutating} onCancel={onCancelEditor} onDraftChange={onDraftChange} onResult={onFormResult} onSuccess={onFormSuccess} result={formResult} title="编辑投递记录" />
            ) : (
              <>
                <header><div><h3>{application.company}</h3><p>{application.role}</p></div></header>
                <dl>
                  <div><dt>公司官网</dt><dd><CompanyWebsiteLink companyName={application.company} companies={companies} /></dd></div>
                  <div><dt>地点</dt><dd>{application.location || "—"}</dd></div>
                  <InlineApplicationFields application={application} canEdit={canEdit} companies={companies} isMutating={isMutating} layout="card" now={now} onUpdate={(nextDraft) => updateAction(application.id, applicationDraftToFormData(nextDraft))} />
                  <div><dt>备注</dt><dd>{application.notes || "—"}</dd></div>
                </dl>
                {canEdit ? (
                  <div className="row-actions">
                    <button aria-label={`编辑 ${application.company} ${application.role}`} data-focus-key={`edit-${application.id}`} disabled={isMutating} onClick={() => onStartEdit(application, `edit-${application.id}`)} type="button">编辑</button>
                    {canDelete ? <button aria-label={`删除 ${application.company} ${application.role}`} data-focus-key={`delete-${application.id}`} disabled={isMutating} onClick={() => onRequestDelete(application, `delete-${application.id}`)} type="button">删除</button> : null}
                  </div>
                ) : null}
              </>
            )}
          </article>
        ))}
      </div>
      {showEmptyState && applications.length === 0 ? <p className="application-empty">暂无申请记录</p> : null}
    </div>
  );
}
