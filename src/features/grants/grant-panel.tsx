"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceMember } from "@/features/applications/types";
import { createEditGrant, revokeEditGrant } from "./actions";
import type { EditGrant } from "./schemas";

type Duration = "1h" | "1d" | "7d" | "custom";
type Notice = { kind: "success" | "error"; text: string } | null;

const DURATION_MS: Record<Exclude<Duration, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function customShanghaiTimeToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatGrantExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间无效";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}（北京时间）`;
}

export function GrantPanel({
  ownerId,
  members,
  activeGrants,
  loadError,
  initialNow,
}: {
  ownerId: string;
  members: readonly WorkspaceMember[];
  activeGrants?: readonly EditGrant[];
  loadError?: string;
  initialNow?: string;
}) {
  const router = useRouter();
  const teammates = useMemo(() => members.filter((member) => member.id !== ownerId), [members, ownerId]);
  const [granteeId, setGranteeId] = useState(teammates[0]?.id ?? "");
  const [duration, setDuration] = useState<Duration>("1h");
  const [customExpiry, setCustomExpiry] = useState("");
  const parsedInitialNow = initialNow ? new Date(initialNow).getTime() : Date.now();
  const [currentTime, setCurrentTime] = useState(Number.isFinite(parsedInitialNow) ? parsedInitialNow : Date.now());
  const [grants, setGrants] = useState<EditGrant[]>(activeGrants ? [...activeGrants] : []);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const lockRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const visibleGrants = useMemo(
    () => grants.filter((grant) => new Date(grant.expiresAt).getTime() > currentTime),
    [currentTime, grants],
  );
  const displayedError = notice?.kind === "error" ? notice.text : loadError;
  const successNotice = displayedError || notice?.kind !== "success" ? "" : notice.text;

  useEffect(() => {
    if (activeGrants !== undefined) setGrants([...activeGrants]);
  }, [activeGrants]);
  useEffect(() => {
    if (!initialNow) return;
    const value = new Date(initialNow).getTime();
    if (Number.isFinite(value)) setCurrentTime(value);
  }, [initialNow]);
  useEffect(() => {
    const nextExpiry = visibleGrants.reduce<number | null>((nearest, grant) => {
      const expiry = new Date(grant.expiresAt).getTime();
      return nearest === null || expiry < nearest ? expiry : nearest;
    }, null);
    if (nextExpiry === null) return;
    const delay = Math.min(Math.max(0, nextExpiry - Date.now()), 2_147_483_647);
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [visibleGrants]);
  useEffect(() => {
    if (displayedError) errorRef.current?.focus();
  }, [displayedError]);

  const memberById = (id: string) => members.find((member) => member.id === id);
  const run = async (operation: () => Promise<void>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setPending(true);
    try {
      await operation();
    } finally {
      lockRef.current = false;
      setPending(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      setNotice(null);
      const expiresAt = duration === "custom"
        ? customShanghaiTimeToIso(customExpiry)
        : new Date(Date.now() + DURATION_MS[duration]).toISOString();
      if (!expiresAt) {
        setNotice({ kind: "error", text: "请输入有效的北京时间" });
        return;
      }
      let result;
      try {
        result = await createEditGrant({ granteeId, expiresAt });
      } catch {
        result = { ok: false as const, message: "编辑授权创建失败，请稍后重试" };
      }
      if (!result.ok) {
        setNotice({ kind: "error", text: result.message });
        return;
      }
      if (result.data) {
        setGrants((current) => [...current.filter((grant) => grant.granteeId !== result.data?.granteeId), result.data!]);
      }
      setNotice({ kind: "success", text: "编辑权限已更新" });
      router.refresh();
    });
  };

  const revoke = (grant: EditGrant) => {
    void run(async () => {
      setNotice(null);
      let result;
      try {
        result = await revokeEditGrant({ grantId: grant.id });
      } catch {
        result = { ok: false as const, message: "编辑授权撤销失败，请稍后重试" };
      }
      if (!result.ok) {
        setNotice({ kind: "error", text: result.message });
        return;
      }
      setGrants((current) => current.filter(({ id }) => id !== grant.id));
      setNotice({ kind: "success", text: "编辑权限已撤销" });
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="grant-panel-title" className="grant-panel">
      <div className="panel-heading"><div><p className="panel-eyebrow">EDIT ACCESS</p><h2 id="grant-panel-title">临时编辑权限</h2></div><p>到期时间统一按北京时间显示。</p></div>
      <p aria-atomic="true" aria-live="polite" role="status">{successNotice}</p>
      {displayedError ? <p ref={errorRef} role="alert" tabIndex={-1}>{displayedError}</p> : null}
      {loadError ? <p>授权列表暂时不可用；以下保留最近一次已知状态。</p> : null}
      {teammates.length === 0 ? <p>邀请队友加入后即可授权。</p> : (
        <form onSubmit={submit}>
          <label>
            授权成员
            <select aria-label="授权成员" disabled={pending} onChange={(event) => setGranteeId(event.target.value)} value={granteeId}>
              {teammates.map((member) => (
                <option key={member.id} value={member.id}>{member.displayName || member.email}（{member.email}）</option>
              ))}
            </select>
          </label>
          <label>
            授权时长
            <select aria-label="授权时长" disabled={pending} onChange={(event) => setDuration(event.target.value as Duration)} value={duration}>
              <option value="1h">1 小时</option>
              <option value="1d">1 天</option>
              <option value="7d">7 天</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          {duration === "custom" ? (
            <label>
              自定义到期时间（北京时间）
              <input aria-label="自定义到期时间（北京时间）" disabled={pending} onChange={(event) => setCustomExpiry(event.target.value)} required type="datetime-local" value={customExpiry} />
            </label>
          ) : null}
          <button disabled={pending || !granteeId} type="submit">{pending ? "正在授权…" : "授予编辑权限"}</button>
        </form>
      )}
      <h3>生效中的授权</h3>
      {visibleGrants.length === 0 ? <p>{loadError ? "无法确认当前生效授权" : "暂无生效中的编辑授权"}</p> : (
        <ul>
          {visibleGrants.map((grant) => {
            const teammate = memberById(grant.granteeId);
            const name = teammate?.displayName || teammate?.email || "未知成员";
            return (
              <li key={grant.id}>
                <span>{name} · 到期：{formatGrantExpiry(grant.expiresAt)}</span>
                <button aria-label={`撤销${name}的编辑权限`} disabled={pending} onClick={() => revoke(grant)} type="button">
                  {pending ? "处理中…" : "撤销"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
