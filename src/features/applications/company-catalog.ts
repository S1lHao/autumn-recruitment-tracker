import type { Application, SharedCompany } from "./types";

export function normalizeCompanyName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function companyWebsiteLabel(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

export function companyWebsiteFor(companyName: string, companies: readonly SharedCompany[]) {
  const normalizedName = normalizeCompanyName(companyName);
  return companies.find((company) => normalizeCompanyName(company.name) === normalizedName)?.website ?? null;
}

export function unappliedCompanies(
  companies: readonly SharedCompany[],
  applications: readonly Application[],
) {
  const appliedCompanyNames = new Set(applications.map((application) => normalizeCompanyName(application.company)));
  return companies
    .filter((company) => !appliedCompanyNames.has(normalizeCompanyName(company.name)))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}
