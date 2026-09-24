"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ActionResult } from "@/features/shared/result";
import { createApplication, deleteApplication, updateApplication } from "./actions";
import { ApplicationCards, CompanyWebsiteLink, PendingCompanyTasks } from "./application-cards";
import { DeadlineValue, deadlinePresentation, formatApplicationDate } from "./application-display";
import { unappliedCompanies } from "./company-catalog";
import { ApplicationForm, EMPTY_APPLICATION_DRAFT, applicationDraftToFormData, applicationToDraft, newApplicationDraft, type ApplicationDraft } from "./application-form";
import { EmptyState } from "./empty-state";
import { filterApplications, type ApplicationSortDirection, type ApplicationSortField } from "./filter-applications";
import { InlineApplicationFields } from "./inline-application-fields";
import type { Application, SharedCompany, WorkspaceMember } from "./types";
import type { WorkspacePermission } from "./application-workspace";

type SortableField = Extract<ApplicationSortField, "company" | "location" | "stage" | "deadline">;
type EditorState = { kind: "create" } | { kind: "edit"; applicationId: string } | null;

export type ApplicationListProps = {
  applications: readonly Application[];
  allApplications?: readonly Application[];
  permission: WorkspacePermission;
  selectedMember: WorkspaceMember;
  now: Date;
  sortBy?: ApplicationSortField;
  sortDirection?: ApplicationSortDirection;
  onSort?: (field: SortableField, direction: ApplicationSortDirection) => void;
  onPermissionRevoked?: () => void;
  showEmptyState?: boolean;
  emptyStateKind?: "empty" | "filtered";
  onClearEmptyState?: () => void;
  companies?: readonly SharedCompany[];
  companyLoadError?: string;
  pendingCompanySearch?: string;
  showPendingCompanies?: boolean;
};

const SORTABLE_HEADERS: { field: SortableField; label: string }[] = [
  { field: "company", label: "公司" },
  { field: "location", label: "地点" },
  { field: "stage", label: "当前进度" },
  { field: "deadline", label: "截止时间" },
];
const MOBILE_QUERY = "(max-width: 767px)";

function getMobileSnapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY).matches
    : false;
}

function subscribeToMobile(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(MOBILE_QUERY);
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
  }
  media.addListener(callback);
  return () => media.removeListener(callback);
}

function useIsMobile() {
  return useSyncExternalStore(subscribeToMobile, getMobileSnapshot, () => false);
}

function SortableHeader({ field, label, sortBy, direction, onSort }: {
  field: SortableField;
  label: string;
  sortBy?: ApplicationSortField;
  direction: ApplicationSortDirection;
  onSort: (field: SortableField) => void;
}) {
  const active = sortBy === field;
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} scope="col">
      <button aria-label={`按${label}排序`} onClick={() => onSort(field)} type="button">
        {label}{active ? (direction === "asc" ? " ↑" : " ↓") : null}
      </button>
    </th>
  );
}

function ConfirmDeleteDialog({ application, error, isPending, onClose, onConfirm }: {
  application: Application;
  error: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } catch {
      dialog.setAttribute("open", "");
    }
    cancelRef.current?.focus();
    const cancel = (event: Event) => { event.preventDefault(); onCloseRef.current(); };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isPending) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog aria-labelledby="delete-application-title" aria-modal="true" className="dialog-backdrop" onKeyDown={trapFocus} ref={dialogRef}>
      <div className="confirm-dialog">
        <h2 id="delete-application-title">确认删除申请</h2>
        <p>确定删除“{application.company} · {application.role}”吗？删除后无法恢复。</p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="form-actions">
          <button disabled={isPending} onClick={onConfirm} type="button">{isPending ? "正在删除…" : "确认删除"}</button>
          <button aria-label="取消删除" disabled={isPending} onClick={onClose} ref={cancelRef} type="button">取消</button>
        </div>
      </div>
    </dialog>
  );
}

export function ApplicationTable({
  applications,
  allApplications = applications,
  permission,
  selectedMember,
  now,
  sortBy,
  sortDirection = "asc",
  onSort,
  onPermissionRevoked,
  showEmptyState = true,
  emptyStateKind = "empty",
  onClearEmptyState,
  companies = [],
  companyLoadError,
  pendingCompanySearch = "",
  showPendingCompanies = true,
}: ApplicationListProps) {
  const isMobile = useIsMobile();
  const [internalSort, setInternalSort] = useState<{ field?: SortableField; direction: ApplicationSortDirection }>({ direction: "asc" });
  const [editor, setEditor] = useState<EditorState>(null);
  const [draft, setDraft] = useState<ApplicationDraft>({ ...EMPTY_APPLICATION_DRAFT });
  const [formResult, setFormResult] = useState<ActionResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isMutating, setIsMutating] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [permissionRevoked, setPermissionRevoked] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");
  const mutationLockRef = useRef(false);
  const permissionRegionRef = useRef<HTMLElement>(null);
  const returnFocusKeyRef = useRef("");
  const restoreFocusKeyRef = useRef("");
  const [restoreFocusTick, setRestoreFocusTick] = useState(0);
  const effectiveSortBy = sortBy ?? internalSort.field;
  const effectiveDirection = sortBy ? sortDirection : internalSort.direction;
  const effectivePermission: WorkspacePermission = permissionRevoked ? "readonly" : permission;
  const canEdit = effectivePermission === "own" || effectivePermission === "temporary";
  const canDelete = effectivePermission === "own";

  useEffect(() => {
    if (!restoreFocusKeyRef.current) return;
    const exact = document.querySelector<HTMLElement>(`[data-focus-key="${restoreFocusKeyRef.current}"]`);
    (exact ?? document.querySelector<HTMLElement>("[data-focus-key='create']"))?.focus();
  }, [restoreFocusTick]);

  useEffect(() => {
    if (permissionRevoked) permissionRegionRef.current?.focus();
  }, [permissionRevoked]);

  useEffect(() => {
    setDeletedIds((current) => {
      const ids = new Set(applications.map(({ id }) => id));
      const retained = new Set([...current].filter((id) => ids.has(id)));
      return retained.size === current.size ? current : retained;
    });
  }, [applications]);

  const records = useMemo(() => {
    const available = applications.filter(({ id }) => !deletedIds.has(id));
    return effectiveSortBy
      ? filterApplications(available, { sortBy: effectiveSortBy, sortDirection: effectiveDirection }, now)
      : available;
  }, [applications, deletedIds, effectiveDirection, effectiveSortBy, now]);

  const pendingCompanies = useMemo(() => {
    if (!showPendingCompanies) return [];
    const availableApplications = allApplications.filter(({ id }) => !deletedIds.has(id));
    const query = pendingCompanySearch.trim().toLocaleLowerCase();
    return unappliedCompanies(companies, availableApplications).filter((company) => {
      if (!query) return true;
      return company.name.toLocaleLowerCase().includes(query)
        || company.website?.toLocaleLowerCase().includes(query);
    });
  }, [allApplications, companies, deletedIds, pendingCompanySearch, showPendingCompanies]);

  const restoreFocus = (key = returnFocusKeyRef.current) => {
    restoreFocusKeyRef.current = key;
    setRestoreFocusTick((value) => value + 1);
  };
  const closeEditor = () => {
    setEditor(null);
    setFormResult(null);
    restoreFocus();
  };
  const startCreate = (focusKey: string) => {
    returnFocusKeyRef.current = focusKey;
    setLiveNotice("");
    setDraft(newApplicationDraft(now));
    setFormResult(null);
    setEditor({ kind: "create" });
  };
  const startCreateForCompany = (company: SharedCompany, focusKey: string) => {
    returnFocusKeyRef.current = focusKey;
    setLiveNotice("");
    setDraft({
      ...newApplicationDraft(now),
      company: company.name,
      companyWebsite: company.website ?? "",
    });
    setFormResult(null);
    setEditor({ kind: "create" });
  };
  const startEdit = (application: Application, focusKey: string) => {
    returnFocusKeyRef.current = focusKey;
    setLiveNotice("");
    setDraft(applicationToDraft(application, companies));
    setFormResult(null);
    setEditor({ kind: "edit", applicationId: application.id });
  };
  const requestDelete = (application: Application, focusKey: string) => {
    returnFocusKeyRef.current = focusKey;
    setDeleteError("");
    setDeleteTarget(application);
  };
  const closeDelete = () => {
    if (isMutating) return;
    setDeleteTarget(null);
    setDeleteError("");
    restoreFocus();
  };

  const runMutation = async (operation: () => Promise<ActionResult>, fallbackMessage: string): Promise<ActionResult> => {
    if (mutationLockRef.current) return { ok: false, message: "操作正在进行，请稍候", code: "MUTATION_PENDING" };
    mutationLockRef.current = true;
    setIsMutating(true);
    let result: ActionResult;
    try {
      result = await operation();
    } catch {
      result = { ok: false, message: fallbackMessage };
    } finally {
      mutationLockRef.current = false;
      setIsMutating(false);
    }
    if (!result.ok && result.code === "PERMISSION_DENIED" && permission === "temporary") {
      setPermissionRevoked(true);
      setLiveNotice(result.message);
      setEditor(null);
      setFormResult(null);
      onPermissionRevoked?.();
    }
    return result;
  };

  const createAction = async (formData: FormData) => {
    const result = await runMutation(() => createApplication(formData), "保存失败，请重试");
    if (result.ok) setLiveNotice("申请记录已保存");
    return result;
  };
  const updateAction = async (applicationId: string, formData: FormData) => {
    const result = await runMutation(() => updateApplication(applicationId, formData), "保存失败，请重试");
    if (result.ok) setLiveNotice("申请记录已保存");
    return result;
  };
  const quickUpdateAction = (applicationId: string, nextDraft: ApplicationDraft) => (
    updateAction(applicationId, applicationDraftToFormData(nextDraft))
  );
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    const result = await runMutation(() => deleteApplication(deleteTarget.id), "删除失败，请重试");
    if (!result.ok) {
      setDeleteError(result.message);
      return;
    }
    const deletedId = deleteTarget.id;
    setDeletedIds((current) => new Set(current).add(deletedId));
    setDeleteTarget(null);
    restoreFocus(`delete-${deletedId}`);
  };
  const changeSort = (field: SortableField) => {
    const direction = effectiveSortBy === field && effectiveDirection === "asc" ? "desc" : "asc";
    if (onSort) onSort(field, direction);
    else setInternalSort({ field, direction });
  };

  const sharedViewProps = {
    applications: records,
    companies,
    pendingCompanies,
    permission: effectivePermission,
    ownerId: selectedMember.id,
    now,
    creating: editor?.kind === "create",
    editingId: editor?.kind === "edit" ? editor.applicationId : null,
    draft,
    formResult,
    isMutating,
    showEmptyState: false,
    createAction,
    updateAction,
    onCancelEditor: closeEditor,
    onDraftChange: setDraft,
    onFormResult: setFormResult,
    onFormSuccess: closeEditor,
    onRequestDelete: requestDelete,
    onStartCreate: startCreate,
    onStartCreateForCompany: startCreateForCompany,
    onStartEdit: startEdit,
  };

  return (
    <section
      aria-label={effectivePermission === "readonly" ? "申请记录操作区，当前为只读" : "申请记录操作区"}
      className="application-actions-region"
      ref={permissionRegionRef}
      tabIndex={-1}
    >
      <p aria-atomic="true" aria-live="polite" className="workspace-live-notice" role="status">{liveNotice}</p>
      {companyLoadError ? <p className="company-library-alert" role="note">{companyLoadError}</p> : null}
      {isMobile ? <ApplicationCards {...sharedViewProps} /> : (
        <div className="applications-desktop">
          {canEdit ? (
            <div className="application-create">
              {editor?.kind !== "create" ? <button data-focus-key="create" disabled={isMutating} onClick={() => startCreate("create")} type="button"><span aria-hidden="true">＋</span>新增申请</button> : (
                <ApplicationForm action={createAction} companies={companies} draft={draft} formId="table-create-application" isPending={isMutating} onCancel={closeEditor} onDraftChange={setDraft} onResult={setFormResult} onSuccess={closeEditor} ownerId={selectedMember.id} result={formResult} title="新增投递记录" />
              )}
            </div>
          ) : null}
          <PendingCompanyTasks companies={pendingCompanies} canEdit={canEdit} isMutating={isMutating} onStartCreate={startCreateForCompany} />
          {records.length > 0 ? <div aria-label="申请记录表格，可横向和纵向滚动" className="application-table-scroll" role="region" tabIndex={0}>
            <table className="application-table">
              <colgroup>
                <col className="application-column-company" />
                <col className="application-column-website" />
                <col className="application-column-role" />
                <col className="application-column-location" />
                <col className="application-column-stage" />
                <col className="application-column-applied" />
                <col className="application-column-next-step" />
                <col className="application-column-deadline" />
                <col className="application-column-notes" />
                <col className="application-column-actions" />
              </colgroup>
              <thead><tr>
                {SORTABLE_HEADERS.slice(0, 1).map((header) => <SortableHeader {...header} direction={effectiveDirection} key={header.field} onSort={changeSort} sortBy={effectiveSortBy} />)}
                <th scope="col">公司官网</th>
                <th scope="col">岗位</th>
                {SORTABLE_HEADERS.slice(1, 3).map((header) => <SortableHeader {...header} direction={effectiveDirection} key={header.field} onSort={changeSort} sortBy={effectiveSortBy} />)}
                <th scope="col">投递日期</th><th scope="col">下一步</th>
                {SORTABLE_HEADERS.slice(3).map((header) => <SortableHeader {...header} direction={effectiveDirection} key={header.field} onSort={changeSort} sortBy={effectiveSortBy} />)}
                <th scope="col">备注</th><th scope="col">操作</th>
              </tr></thead>
              <tbody>
                {records.map((application) => editor?.kind === "edit" && editor.applicationId === application.id ? (
                  <tr key={application.id}><td colSpan={10}><ApplicationForm action={(formData) => updateAction(application.id, formData)} companies={companies} draft={draft} formId={`table-edit-${application.id}`} isPending={isMutating} onCancel={closeEditor} onDraftChange={setDraft} onResult={setFormResult} onSuccess={closeEditor} result={formResult} title="编辑投递记录" /></td></tr>
                ) : (
                  <tr key={application.id}>
                    <td className="application-company-cell"><span>{application.company}</span></td>
                    <td className="application-website-cell"><CompanyWebsiteLink companyName={application.company} companies={companies} /></td>
                    <td className="application-role-cell"><span>{application.role}</span></td>
                    <td className="application-location-cell"><span>{application.location || "—"}</span></td>
                    <InlineApplicationFields application={application} canEdit={canEdit} companies={companies} isMutating={isMutating} layout="table" now={now} onUpdate={(nextDraft) => quickUpdateAction(application.id, nextDraft)} />
                    <td className="application-notes" title={application.notes}>{application.notes || "—"}</td>
                    <td>{canEdit ? <div className="row-actions"><button aria-label={`编辑 ${application.company} ${application.role}`} data-focus-key={`edit-${application.id}`} disabled={isMutating} onClick={() => startEdit(application, `edit-${application.id}`)} type="button">编辑</button>{canDelete ? <button aria-label={`删除 ${application.company} ${application.role}`} data-focus-key={`delete-${application.id}`} disabled={isMutating} onClick={() => requestDelete(application, `delete-${application.id}`)} type="button">删除</button> : null}</div> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : null}
        </div>
      )}
      {showEmptyState && records.length === 0 && pendingCompanies.length === 0 && editor?.kind !== "create" ? <EmptyState kind={emptyStateKind} onClear={onClearEmptyState} /> : null}
      {deleteTarget ? <ConfirmDeleteDialog application={deleteTarget} error={deleteError} isPending={isMutating} onClose={closeDelete} onConfirm={() => void confirmDelete()} /> : null}
    </section>
  );
}

export { DeadlineValue, deadlinePresentation, formatApplicationDate };
