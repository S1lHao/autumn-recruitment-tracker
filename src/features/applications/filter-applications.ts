import type { Application, ApplicationStage } from "./types";

export type DeadlineFilter = "all" | "upcoming" | "overdue";
export type ApplicationSortField = "company" | "stage" | "location" | "deadline" | "updatedAt";
export type ApplicationSortDirection = "asc" | "desc";

export type ApplicationFilterValues = {
  search?: string;
  stage?: ApplicationStage | "all";
  location?: string;
  deadline?: DeadlineFilter;
  sortBy?: ApplicationSortField;
  sortDirection?: ApplicationSortDirection;
};

const SORT_FIELDS = new Set<ApplicationSortField>(["company", "stage", "location", "deadline", "updatedAt"]);
const SORT_DIRECTIONS = new Set<ApplicationSortDirection>(["asc", "desc"]);

/** Converts untrusted query/UI input to the documented ascending default. */
export function normalizeSortDirection(value: unknown): ApplicationSortDirection {
  return typeof value === "string" && SORT_DIRECTIONS.has(value as ApplicationSortDirection)
    ? value as ApplicationSortDirection
    : "asc";
}

function deadlineTime(deadline: string | null): number | null {
  if (!deadline) return null;
  const value = Date.parse(deadline);
  return Number.isNaN(value) ? null : value;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Filters data in memory so the chosen `now` is deterministic in every caller and test. */
export function filterApplications(
  applications: readonly Application[],
  filters: ApplicationFilterValues = {},
  now: Date = new Date(),
): Application[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const location = filters.location?.trim() ?? "";
  const deadlineMode = filters.deadline ?? "all";
  const start = now.getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const sortBy = filters.sortBy && SORT_FIELDS.has(filters.sortBy) ? filters.sortBy : undefined;
  const direction = normalizeSortDirection(filters.sortDirection) === "desc" ? -1 : 1;

  const filtered = applications.filter((application) => {
    const matchesSearch = !search || [application.company, application.role]
      .some((value) => value.toLowerCase().includes(search));
    const matchesStage = !filters.stage || filters.stage === "all" || application.stage === filters.stage;
    const matchesLocation = !location || application.location === location;
    const deadline = deadlineTime(application.deadline);
    const matchesDeadline = deadlineMode === "all"
      || (deadlineMode === "upcoming" && deadline !== null && deadline >= start && deadline <= end)
      || (deadlineMode === "overdue" && deadline !== null && deadline < start);
    return matchesSearch && matchesStage && matchesLocation && matchesDeadline;
  });

  if (!sortBy) return [...filtered];
  return filtered
    .map((application, index) => ({ application, index }))
    .sort((left, right) => {
      let result: number;
      if (sortBy === "deadline") {
        const leftDeadline = deadlineTime(left.application.deadline);
        const rightDeadline = deadlineTime(right.application.deadline);
        // A missing deadline is always last, including descending views.
        if (leftDeadline === null || rightDeadline === null) {
          if (leftDeadline !== rightDeadline) return leftDeadline === null ? 1 : -1;
          result = 0;
        } else {
          result = leftDeadline - rightDeadline;
        }
      } else if (sortBy === "updatedAt") {
        result = Date.parse(left.application.updatedAt) - Date.parse(right.application.updatedAt);
      } else {
        result = compareText(left.application[sortBy], right.application[sortBy]);
      }
      return result === 0 ? left.index - right.index : result * direction;
    })
    .map(({ application }) => application);
}
