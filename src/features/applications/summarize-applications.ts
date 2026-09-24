import type { Application, ApplicationSummary } from "./types";
import { normalizeCompanyName } from "./company-catalog";

export function summarizeApplications(applications: readonly Application[]): ApplicationSummary {
  const uniqueCompanies = new Set(
    applications.map((application) => normalizeCompanyName(application.company)),
  );

  return applications.reduce<ApplicationSummary>(
    (summary, application) => ({
      total: summary.total,
      interviewing: summary.interviewing + (application.stage === "面试" ? 1 : 0),
      pending: summary.pending + (["待测评", "待笔试"].includes(application.stage) ? 1 : 0),
      offers: summary.offers + (application.stage === "Offer" ? 1 : 0),
    }),
    { total: uniqueCompanies.size, interviewing: 0, pending: 0, offers: 0 },
  );
}
