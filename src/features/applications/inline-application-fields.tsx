"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ActionResult } from "@/features/shared/result";
import { DeadlineValue, formatApplicationDate } from "./application-display";
import { applicationToDraft, toDateTimeLocal, type ApplicationDraft } from "./application-form";
import { APPLICATION_STAGES, type Application, type ApplicationStage, type SharedCompany } from "./types";

type QuickFields = Pick<ApplicationDraft, "stage" | "nextStep" | "deadline">;
const NEXT_STEP_SUGGESTIONS = ["完成测评", "准备笔试", "准备面试", "等待通知", "跟进官网状态", "确认截止时间"];

function quickFieldsFor(application: Application): QuickFields {
  return {
    stage: application.stage,
    nextStep: application.nextStep,
    deadline: toDateTimeLocal(application.deadline),
  };
}

export function InlineApplicationFields({
  application,
  companies,
  canEdit,
  isMutating,
  layout,
  now,
  onUpdate,
}: {
  application: Application;
  companies: readonly SharedCompany[];
  canEdit: boolean;
  isMutating: boolean;
  layout: "table" | "card";
  now: Date;
  onUpdate: (draft: ApplicationDraft) => Promise<ActionResult>;
}) {
  const [fields, setFields] = useState<QuickFields>(() => quickFieldsFor(application));
  const [saveMessage, setSaveMessage] = useState("");
  const fieldsRef = useRef<QuickFields>(quickFieldsFor(application));
  const savedFieldsRef = useRef<QuickFields>(quickFieldsFor(application));
  const queuedFieldsRef = useRef<QuickFields | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const nextFields: QuickFields = {
      stage: application.stage,
      nextStep: application.nextStep,
      deadline: toDateTimeLocal(application.deadline),
    };
    setFields(nextFields);
    fieldsRef.current = nextFields;
    savedFieldsRef.current = nextFields;
    queuedFieldsRef.current = null;
    setSaveMessage("");
  }, [application.id, application.deadline, application.nextStep, application.stage]);

  const fieldsMatch = (left: QuickFields, right: QuickFields) => (
    left.stage === right.stage
    && left.nextStep === right.nextStep
    && left.deadline === right.deadline
  );
  const save = async (nextFields: QuickFields) => {
    if (savingRef.current || isMutating) {
      queuedFieldsRef.current = nextFields;
      return;
    }
    if (fieldsMatch(savedFieldsRef.current, nextFields)) return;
    savingRef.current = true;
    setSaveMessage("保存中…");
    const result = await onUpdate({
      ...applicationToDraft(application, companies),
      ...nextFields,
    });
    savingRef.current = false;
    if (result.ok) {
      savedFieldsRef.current = nextFields;
      setSaveMessage("已保存");
    } else {
      setSaveMessage(`${result.message}，请重试`);
    }
    const queuedFields = queuedFieldsRef.current;
    queuedFieldsRef.current = null;
    if (queuedFields && !fieldsMatch(savedFieldsRef.current, queuedFields)) void save(queuedFields);
  };

  const changeStage = (stage: ApplicationStage) => {
    const nextFields = { ...fieldsRef.current, stage };
    fieldsRef.current = nextFields;
    setFields(nextFields);
    void save(nextFields);
  };
  const changeDeadline = (deadline: string) => {
    const nextFields = { ...fieldsRef.current, deadline };
    fieldsRef.current = nextFields;
    setFields(nextFields);
    void save(nextFields);
  };
  const saveNextStep = () => void save(fieldsRef.current);
  const saveNextStepOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  };

  const stage = canEdit ? (
    <select
      aria-label={`更新 ${application.company} ${application.role} 当前进度`}
      className="inline-stage-select"
      data-stage={fields.stage}
      disabled={isMutating}
      onChange={(event) => changeStage(event.target.value as ApplicationStage)}
      value={fields.stage}
    >
      {APPLICATION_STAGES.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
  ) : <span className="stage-badge" data-stage={application.stage}>{application.stage}</span>;
  const nextStep = canEdit ? (
    <input
      aria-label={`更新 ${application.company} ${application.role} 下一步`}
      disabled={isMutating}
      list={`next-step-options-${application.id}`}
      maxLength={200}
      onBlur={saveNextStep}
      onChange={(event) => {
        const nextFields = { ...fieldsRef.current, nextStep: event.target.value };
        fieldsRef.current = nextFields;
        setFields(nextFields);
        setSaveMessage("");
      }}
      onKeyDown={saveNextStepOnEnter}
      placeholder="填写下一步"
      value={fields.nextStep}
    />
  ) : application.nextStep || "—";
  const deadline = canEdit ? (
    <input
      aria-label={`更新 ${application.company} ${application.role} 截止时间`}
      disabled={isMutating}
      onChange={(event) => changeDeadline(event.target.value)}
      type="datetime-local"
      value={fields.deadline}
    />
  ) : <DeadlineValue deadline={application.deadline} now={now} />;
  const saveFailed = saveMessage.endsWith("请重试");
  const nextStepOptions = canEdit ? (
    <datalist id={`next-step-options-${application.id}`}>
      {NEXT_STEP_SUGGESTIONS.map((suggestion) => <option key={suggestion} value={suggestion} />)}
    </datalist>
  ) : null;
  const saveState = saveMessage ? (
    <span className="inline-save-feedback">
      <span className="inline-save-state" data-state={saveMessage === "已保存" ? "saved" : "active"}>{saveMessage}</span>
      {saveFailed ? <button disabled={isMutating} onClick={() => void save(fieldsRef.current)} type="button">重试</button> : null}
    </span>
  ) : null;

  if (layout === "table") {
    return (
      <>
        <td className="application-stage-cell"><div className="inline-application-field">{stage}</div></td>
        <td className="application-date-cell"><span>{formatApplicationDate(application.appliedOn)}</span></td>
        <td className="application-next-step-cell"><div className="inline-application-field">{nextStep}{nextStepOptions}</div></td>
        <td className="application-deadline-cell"><div className="inline-application-field">{deadline}{saveState}</div></td>
      </>
    );
  }

  return (
    <>
      <div><dt>当前进度</dt><dd><div className="inline-application-field">{stage}</div></dd></div>
      <div><dt>投递日期</dt><dd>{formatApplicationDate(application.appliedOn)}</dd></div>
      <div><dt>下一步</dt><dd><div className="inline-application-field">{nextStep}{nextStepOptions}</div></dd></div>
      <div><dt>截止时间</dt><dd><div className="inline-application-field">{deadline}{saveState}</div></dd></div>
    </>
  );
}
