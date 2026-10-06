import { expect, it } from "vitest";
import { activeCompanies, companyWebsiteFor, unappliedCompanies } from "./company-catalog";

it("excludes removed names from the watchlist/options but retains websites for historical records", () => {
  const companies = [
    { id: "duplicate", name: "农业银行", website: "https://example.com", archivedAt: "2026-10-06T00:00:00Z" },
    { id: "canonical", name: "中国农业银行", website: "https://example.com", archivedAt: null },
  ];
  expect(activeCompanies(companies)).toEqual([companies[1]]);
  expect(unappliedCompanies(companies, [])).toEqual([companies[1]]);
  expect(companyWebsiteFor("农业银行", companies)).toBe("https://example.com");
});
