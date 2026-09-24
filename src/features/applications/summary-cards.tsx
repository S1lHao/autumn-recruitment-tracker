import type { Application } from "./types";
import { summarizeApplications } from "./summarize-applications";

export function SummaryCards({ applications }: { applications: readonly Application[] }) {
  const summary = summarizeApplications(applications);
  const cards = [
    ["已投递公司", summary.total, "按公司去重"],
    ["面试中", summary.interviewing, "正在推进"],
    ["待处理", summary.pending, "待测评 / 待笔试"],
    ["Offer", summary.offers, "已获录用"],
  ] as const;
  return <section aria-label="申请汇总"><ul>{cards.map(([label, value, hint], index) => <li data-summary-index={index} key={label}><div><span>{label}</span><small>{hint}</small></div><strong>{value}</strong></li>)}</ul></section>;
}
