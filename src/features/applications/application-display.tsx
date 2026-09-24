export function formatApplicationDate(value: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : "—";
}

export function deadlinePresentation(deadline: string | null, now = new Date()) {
  if (!deadline) return { label: "—", className: "" };
  const timestamp = Date.parse(deadline);
  if (Number.isNaN(timestamp)) return { label: "—", className: "" };
  const formatted = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(timestamp);
  if (timestamp < now.getTime()) return { label: `已逾期 · ${formatted}`, className: "deadline-overdue" };
  if (timestamp <= now.getTime() + 7 * 24 * 60 * 60 * 1000) return { label: `7 天内 · ${formatted}`, className: "deadline-upcoming" };
  return { label: formatted, className: "" };
}

export function DeadlineValue({ deadline, now }: { deadline: string | null; now?: Date }) {
  const presentation = deadlinePresentation(deadline, now);
  return <span className={presentation.className}>{presentation.label}</span>;
}
