"use client";

import { APPLICATION_STAGES } from "./types";
import type { ApplicationFilterValues } from "./filter-applications";

export const EMPTY_APPLICATION_FILTERS: ApplicationFilterValues = {
  search: "",
  stage: "all",
  location: "",
  deadline: "all",
  sortBy: "updatedAt",
  sortDirection: "desc",
};

export function ApplicationFilters({
  filters,
  onChange,
  showClear = true,
}: {
  filters: ApplicationFilterValues;
  onChange: (filters: ApplicationFilterValues) => void;
  showClear?: boolean;
}) {
  const change = (key: keyof ApplicationFilterValues, value: string) => onChange({ ...filters, [key]: value });
  return (
    <fieldset className="application-filters">
      <legend>筛选与排序</legend>
      <label>
        搜索
        <input aria-label="公司/岗位搜索" placeholder="公司或岗位名称" value={filters.search ?? ""} onChange={(event) => change("search", event.target.value)} />
      </label>
      <label>
        阶段
        <select value={filters.stage ?? "all"} onChange={(event) => change("stage", event.target.value)}>
          <option value="all">全部阶段</option>
          {APPLICATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
      </label>
      <label>
        地点
        <input placeholder="城市或地区" value={filters.location ?? ""} onChange={(event) => change("location", event.target.value)} />
      </label>
      <label>
        截止时间
        <select value={filters.deadline ?? "all"} onChange={(event) => change("deadline", event.target.value)}>
          <option value="all">全部</option>
          <option value="upcoming">未来 7 天</option>
          <option value="overdue">已过期</option>
        </select>
      </label>
      <label>
        排序
        <select value={filters.sortBy ?? "updatedAt"} onChange={(event) => change("sortBy", event.target.value)}>
          <option value="updatedAt">最近更新</option>
          <option value="deadline">截止时间</option>
          <option value="company">公司</option>
          <option value="stage">阶段</option>
          <option value="location">地点</option>
        </select>
      </label>
      <label>
        方向
        <select value={filters.sortDirection ?? "desc"} onChange={(event) => change("sortDirection", event.target.value)}>
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </label>
      {showClear ? <button type="button" onClick={() => onChange(EMPTY_APPLICATION_FILTERS)}>清除筛选</button> : null}
    </fieldset>
  );
}
