import { describe, expect, it } from "vitest";
import { parseApplicationInput } from "./schemas";
import { APPLICATION_STAGES } from "./types";

const validInput = {
  company: "  Example Corp  ",
  companyWebsite: " https://example.com ",
  role: "  Frontend Engineer ",
  location: "  Shanghai ",
  stage: "面试",
  appliedOn: "2026-09-04",
  nextStep: "  Technical interview  ",
  deadline: "2026-09-05T09:30:00.000+08:00",
  notes: "  Ask about the team.  ",
};

describe("parseApplicationInput", () => {
  it("exposes separate assessment, written-test, and waiting-pool stages", () => {
    expect(APPLICATION_STAGES).toEqual([
      "待投递",
      "已投递",
      "待测评",
      "待笔试",
      "泡池子ing",
      "面试",
      "Offer",
      "已拒绝",
      "已放弃",
    ]);
    expect(parseApplicationInput({ ...validInput, stage: "待测评" }).success).toBe(true);
    expect(parseApplicationInput({ ...validInput, stage: "待笔试" }).success).toBe(true);
    expect(parseApplicationInput({ ...validInput, stage: "泡池子ing" }).success).toBe(true);
    expect(parseApplicationInput({ ...validInput, stage: "笔试" }).success).toBe(false);
  });

  it("requires trimmed company and role within their maximum length", () => {
    expect(parseApplicationInput({ ...validInput, company: "   " }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, role: " 	 " }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, company: "x".repeat(121) }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, role: "x".repeat(121) }).success).toBe(false);
  });

  it("validates field lengths, the exact stage enum, dates, and safe company websites", () => {
    expect(parseApplicationInput({ ...validInput, location: "x".repeat(121) }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, nextStep: "x".repeat(241) }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, notes: "x".repeat(5001) }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, stage: "录用" }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, appliedOn: "2026-02-30" }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, deadline: "tomorrow" }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, companyWebsite: "javascript:alert(1)" }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, companyWebsite: "data:text/html,no" }).success).toBe(false);
    expect(parseApplicationInput({ ...validInput, companyWebsite: "ftp://example.com/a" }).success).toBe(false);
  });

  it("trims editable text and turns empty nullable values into null", () => {
    const parsed = parseApplicationInput({
      ...validInput,
      appliedOn: "",
      deadline: " ",
      companyWebsite: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        company: "Example Corp",
        companyWebsite: null,
        role: "Frontend Engineer",
        location: "Shanghai",
        stage: "面试",
        appliedOn: null,
        nextStep: "Technical interview",
        deadline: null,
        notes: "Ask about the team.",
      });
    }
  });
});
