import { describe, expect, it } from "vitest";
import { filterApplications, normalizeSortDirection, type ApplicationFilterValues } from "./filter-applications";
import type { Application } from "./types";

const now = new Date("2026-09-07T12:00:00.000Z");
const applications: Application[] = [
  { id: "openai", workspaceId: "w", ownerId: "u", company: "OpenAI", role: "Research Engineer", location: "上海", stage: "面试", appliedOn: null, nextStep: "", deadline: "2026-09-14T12:00:00.000Z", jobUrl: null, notes: "", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" },
  { id: "other", workspaceId: "w", ownerId: "u", company: "Example", role: "OpenAI liaison", location: "北京", stage: "已投递", appliedOn: null, nextStep: "", deadline: "2026-09-14T12:00:00.001Z", jobUrl: null, notes: "", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
  { id: "past", workspaceId: "w", ownerId: "u", company: "Past", role: "Engineer", location: "上海", stage: "面试", appliedOn: null, nextStep: "", deadline: "2026-09-07T11:59:59.999Z", jobUrl: null, notes: "", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" },
  { id: "none", workspaceId: "w", ownerId: "u", company: "None", role: "Engineer", location: "上海", stage: "面试", appliedOn: null, nextStep: "", deadline: null, jobUrl: null, notes: "", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z" },
];

describe("filterApplications", () => {
  it("matches company or role without case sensitivity and combines exact filters", () => {
    expect(filterApplications(applications, { search: "oPeNaI", stage: "面试", location: "上海", deadline: "upcoming" }, now).map(({ id }) => id)).toEqual(["openai"]);
  });

  it("keeps deadline boundaries inclusive and treats overdue separately", () => {
    expect(filterApplications(applications, { deadline: "upcoming" }, now).map(({ id }) => id)).toEqual(["openai"]);
    expect(filterApplications(applications, { deadline: "overdue" }, now).map(({ id }) => id)).toEqual(["past"]);
  });

  it("sorts only allowlisted fields, puts null deadlines last, and retains a stable fallback", () => {
    expect(filterApplications(applications, { sortBy: "deadline", sortDirection: "asc" }, now).map(({ id }) => id)).toEqual(["past", "openai", "other", "none"]);
    expect(filterApplications(applications, { sortBy: "deadline", sortDirection: "desc" }, now).map(({ id }) => id)).toEqual(["other", "openai", "past", "none"]);
    expect(filterApplications(applications, { sortBy: "not-a-column" as never, sortDirection: "desc" }, now).map(({ id }) => id)).toEqual(applications.map(({ id }) => id));
  });

  it("runtime-normalizes invalid and missing sort directions to ascending order", () => {
    const runtimeFilters = { sortBy: "deadline", sortDirection: "sideways" } as unknown as ApplicationFilterValues;
    expect(normalizeSortDirection(runtimeFilters.sortDirection)).toBe("asc");
    expect(normalizeSortDirection(undefined)).toBe("asc");
    expect(filterApplications(applications, runtimeFilters, now).map(({ id }) => id)).toEqual(["past", "openai", "other", "none"]);
  });
});
