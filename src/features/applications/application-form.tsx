"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ActionResult } from "@/features/shared/result";
import { APPLICATION_STAGES, type Application, type ApplicationInput, type ApplicationStage, type SharedCompany } from "./types";

export type ApplicationDraft = Omit<ApplicationInput, "appliedOn" | "deadline" | "companyWebsite"> & {
  appliedOn: string;
  deadline: string;
  companyWebsite: string;
};

export const EMPTY_APPLICATION_DRAFT: ApplicationDraft = {
  company: "",
  companyWebsite: "",
  role: "",
  location: "",
  stage: "待投递",
  appliedOn: "",
  nextStep: "",
  deadline: "",
  notes: "",
};

export function newApplicationDraft(now = new Date()): ApplicationDraft {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const valueByType = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    ...EMPTY_APPLICATION_DRAFT,
    appliedOn: `${valueByType.year}-${valueByType.month}-${valueByType.day}`,
  };
}

type ApplicationFormProps = {
  formId: string;
  draft: ApplicationDraft;
  result: ActionResult | null;
  isPending: boolean;
  ownerId?: string;
  submitLabel?: string;
  title?: string;
  companies?: readonly SharedCompany[];
  action: (formData: FormData) => Promise<ActionResult>;
  onCancel: () => void;
  onDraftChange: (draft: ApplicationDraft) => void;
  onResult: (result: ActionResult) => void;
  onSuccess: () => void;
};

export function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}T${valueByType.hour}:${valueByType.minute}`;
}

export function shanghaiDateTimeLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}:00+08:00`);
  if (Number.isNaN(parsed.getTime()) || toDateTimeLocal(parsed.toISOString()) !== value) return null;
  return parsed.toISOString();
}

export function applicationToDraft(application: Application, companies: readonly SharedCompany[] = []): ApplicationDraft {
  const company = companies.find((entry) => entry.name.localeCompare(application.company, undefined, { sensitivity: "accent" }) === 0);
  return {
    company: application.company,
    companyWebsite: company?.website ?? "",
    role: application.role,
    location: application.location,
    stage: application.stage,
    appliedOn: application.appliedOn ?? "",
    nextStep: application.nextStep,
    deadline: toDateTimeLocal(application.deadline),
    notes: application.notes,
  };
}

function prepareFormData(form: HTMLFormElement) {
  const formData = new FormData(form);
  const deadline = formData.get("deadline");
  if (typeof deadline === "string" && deadline) {
    formData.set("deadline", shanghaiDateTimeLocalToIso(deadline) ?? deadline);
  }
  return formData;
}

export function applicationDraftToFormData(draft: ApplicationDraft) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(draft)) formData.set(key, value);
  if (draft.deadline) formData.set("deadline", shanghaiDateTimeLocalToIso(draft.deadline) ?? draft.deadline);
  return formData;
}

export function ApplicationForm({
  formId,
  draft,
  result,
  isPending,
  ownerId,
  submitLabel = "保存",
  title,
  companies = [],
  action,
  onCancel,
  onDraftChange,
  onResult,
  onSuccess,
}: ApplicationFormProps) {
  const pendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const companyFieldRef = useRef<HTMLDivElement>(null);
  const [isCompanyMenuOpen, setIsCompanyMenuOpen] = useState(false);

  const visibleCompanies = useMemo(() => {
    const query = draft.company.trim().toLocaleLowerCase();
    if (!query) return companies;
    return companies.filter((company) => company.name.toLocaleLowerCase().includes(query));
  }, [companies, draft.company]);

  useEffect(() => {
    if (result && !result.ok) errorSummaryRef.current?.focus();
    else firstFieldRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (!isCompanyMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!companyFieldRef.current?.contains(event.target as Node)) setIsCompanyMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isCompanyMenuOpen]);

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (pendingRef.current || isPending || !formRef.current) return;
    pendingRef.current = true;
    try {
      const nextResult = await action(prepareFormData(formRef.current));
      onResult(nextResult);
      if (nextResult.ok) onSuccess();
    } catch {
      onResult({ ok: false, message: "保存失败，请重试" });
    } finally {
      pendingRef.current = false;
    }
  };

  const change = <Key extends keyof ApplicationDraft>(name: Key, value: ApplicationDraft[Key]) =>
    onDraftChange({ ...draft, [name]: value });

  const changeCompany = (value: string) => {
    const match = companies.find((company) => company.name.localeCompare(value.trim(), undefined, { sensitivity: "accent" }) === 0);
    onDraftChange({
      ...draft,
      company: value,
      companyWebsite: match?.website ?? "",
    });
  };

  const selectCompany = (company: SharedCompany) => {
    onDraftChange({
      ...draft,
      company: company.name,
      companyWebsite: company.website ?? "",
    });
    setIsCompanyMenuOpen(false);
    firstFieldRef.current?.focus();
  };

  const fieldError = (name: keyof ApplicationInput) =>
    result && !result.ok ? result.fieldErrors?.[name]?.[0] : undefined;
  const describedBy = (name: keyof ApplicationInput) => fieldError(name) ? `${formId}-${name}-error` : undefined;

  return (
    <form className="application-form" noValidate onSubmit={submit} ref={formRef}>
      {ownerId ? <input name="ownerId" type="hidden" value={ownerId} /> : null}
      {title ? <header className="application-form-heading"><div><p className="panel-eyebrow">APPLICATION DETAILS</p><h3>{title}</h3></div><p>完整记录岗位信息，后续进展会更清晰。</p></header> : null}
      {result && !result.ok ? (
        <div aria-label="保存失败" className="form-error-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}>
          <strong>{result.message}</strong>
          <button disabled={isPending} onClick={() => void submit()} type="button">重试</button>
        </div>
      ) : null}
      <div className="application-form-grid">
        <div className="application-company-field" ref={companyFieldRef}>
          <label htmlFor={`${formId}-company`}>公司</label>
          <div className="company-combobox">
            <input
              aria-autocomplete="list"
              aria-controls={`${formId}-company-options`}
              aria-describedby={`${formId}-company-hint${fieldError("company") ? ` ${formId}-company-error` : ""}`}
              aria-expanded={isCompanyMenuOpen}
              aria-haspopup="listbox"
              aria-invalid={Boolean(fieldError("company"))}
              aria-label="公司"
              id={`${formId}-company`}
              maxLength={120}
              name="company"
              onChange={(event) => {
                changeCompany(event.target.value);
                setIsCompanyMenuOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") setIsCompanyMenuOpen(true);
                if (event.key === "Escape") setIsCompanyMenuOpen(false);
              }}
              ref={firstFieldRef}
              required
              role="combobox"
              value={draft.company}
            />
            <button
              aria-expanded={isCompanyMenuOpen}
              aria-label={isCompanyMenuOpen ? "收起共享公司库" : "展开共享公司库"}
              className="company-combobox-toggle"
              onClick={() => setIsCompanyMenuOpen((open) => !open)}
              type="button"
            >
              <ChevronDown aria-hidden="true" size={18} strokeWidth={2} />
            </button>
            {isCompanyMenuOpen ? (
              visibleCompanies.length > 0 ? (
                <div aria-label="共享公司库" className="company-combobox-menu" id={`${formId}-company-options`} role="listbox">
                  {visibleCompanies.map((company) => (
                    <button
                      aria-selected={company.name === draft.company}
                      className="company-combobox-option"
                      key={company.id}
                      onClick={() => selectCompany(company)}
                      role="option"
                      type="button"
                    >
                      <strong>{company.name}</strong>
                      <span>{company.website ?? "暂无官网"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="company-combobox-empty" id={`${formId}-company-options`} role="status">
                  {companies.length === 0 ? "共享公司库暂无公司，保存后会自动加入" : "没有匹配公司，可直接输入以创建"}
                </p>
              )
            ) : null}
          </div>
          <span className="field-hint" id={`${formId}-company-hint`}>{companies.length === 0 ? "输入公司名称，保存后自动加入共享公司库" : "从共享公司库选择，或直接输入新公司"}</span>
          {fieldError("company") ? <span className="field-error" id={`${formId}-company-error`}>{fieldError("company")}</span> : null}
        </div>
        <label htmlFor={`${formId}-companyWebsite`}>
          公司官网
          <input aria-describedby={describedBy("companyWebsite")} aria-invalid={Boolean(fieldError("companyWebsite"))} aria-label="公司官网" id={`${formId}-companyWebsite`} name="companyWebsite" onChange={(event) => change("companyWebsite", event.target.value)} placeholder="https://company.com" type="url" value={draft.companyWebsite} />
          {fieldError("companyWebsite") ? <span className="field-error" id={`${formId}-companyWebsite-error`}>{fieldError("companyWebsite")}</span> : null}
        </label>
        <label htmlFor={`${formId}-role`}>
          岗位
          <input aria-describedby={describedBy("role")} aria-invalid={Boolean(fieldError("role"))} aria-label="岗位" id={`${formId}-role`} maxLength={120} name="role" onChange={(event) => change("role", event.target.value)} required value={draft.role} />
          {fieldError("role") ? <span className="field-error" id={`${formId}-role-error`}>{fieldError("role")}</span> : null}
        </label>
        <label htmlFor={`${formId}-location`}>
          地点
          <input aria-describedby={describedBy("location")} aria-invalid={Boolean(fieldError("location"))} aria-label="地点" id={`${formId}-location`} maxLength={120} name="location" onChange={(event) => change("location", event.target.value)} value={draft.location} />
          {fieldError("location") ? <span className="field-error" id={`${formId}-location-error`}>{fieldError("location")}</span> : null}
        </label>
        <label htmlFor={`${formId}-stage`}>
          当前进度
          <select aria-describedby={describedBy("stage")} aria-invalid={Boolean(fieldError("stage"))} aria-label="当前进度" id={`${formId}-stage`} name="stage" onChange={(event) => change("stage", event.target.value as ApplicationStage)} value={draft.stage}>
            {APPLICATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          {fieldError("stage") ? <span className="field-error" id={`${formId}-stage-error`}>{fieldError("stage")}</span> : null}
        </label>
        <label htmlFor={`${formId}-appliedOn`}>
          投递日期
          <input aria-describedby={describedBy("appliedOn")} aria-invalid={Boolean(fieldError("appliedOn"))} aria-label="投递日期" id={`${formId}-appliedOn`} name="appliedOn" onChange={(event) => change("appliedOn", event.target.value)} type="date" value={draft.appliedOn} />
          {fieldError("appliedOn") ? <span className="field-error" id={`${formId}-appliedOn-error`}>{fieldError("appliedOn")}</span> : null}
        </label>
        <label htmlFor={`${formId}-nextStep`}>
          下一步
          <input aria-describedby={describedBy("nextStep")} aria-invalid={Boolean(fieldError("nextStep"))} aria-label="下一步" id={`${formId}-nextStep`} maxLength={240} name="nextStep" onChange={(event) => change("nextStep", event.target.value)} value={draft.nextStep} />
          {fieldError("nextStep") ? <span className="field-error" id={`${formId}-nextStep-error`}>{fieldError("nextStep")}</span> : null}
        </label>
        <label htmlFor={`${formId}-deadline`}>
          截止时间（北京时间）
          <input aria-describedby={describedBy("deadline")} aria-invalid={Boolean(fieldError("deadline"))} aria-label="截止时间（北京时间）" id={`${formId}-deadline`} name="deadline" onChange={(event) => change("deadline", event.target.value)} type="datetime-local" value={draft.deadline} />
          {fieldError("deadline") ? <span className="field-error" id={`${formId}-deadline-error`}>{fieldError("deadline")}</span> : null}
        </label>
        <label className="application-form-notes" htmlFor={`${formId}-notes`}>
          备注
          <textarea aria-describedby={describedBy("notes")} aria-invalid={Boolean(fieldError("notes"))} aria-label="备注" id={`${formId}-notes`} maxLength={5000} name="notes" onChange={(event) => change("notes", event.target.value)} rows={3} value={draft.notes} />
          {fieldError("notes") ? <span className="field-error" id={`${formId}-notes-error`}>{fieldError("notes")}</span> : null}
        </label>
      </div>
      <div className="form-actions">
        <button disabled={isPending} type="submit">{isPending ? "正在保存…" : submitLabel}</button>
        <button disabled={isPending} onClick={onCancel} type="button">取消</button>
      </div>
    </form>
  );
}
