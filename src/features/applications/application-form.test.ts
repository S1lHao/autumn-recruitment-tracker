import { describe, expect, it } from "vitest";
import { newApplicationDraft, shanghaiDateTimeLocalToIso, toDateTimeLocal } from "./application-form";

it("defaults new applications to the current Beijing date", () => {
  expect(newApplicationDraft(new Date("2026-09-21T16:30:00.000Z")).appliedOn).toBe("2026-09-22");
});

describe("application deadline conversion", () => {
  it("formats stored instants as Asia/Shanghai datetime-local values in every process timezone", () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utc = toDateTimeLocal("2026-09-10T12:00:00.000Z");
      process.env.TZ = "America/Los_Angeles";
      const pacific = toDateTimeLocal("2026-09-10T12:00:00.000Z");
      expect(utc).toBe("2026-09-10T20:00");
      expect(pacific).toBe(utc);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("parses datetime-local input as Beijing time in every process timezone", () => {
    const originalTimezone = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utc = shanghaiDateTimeLocalToIso("2026-09-10T20:00");
      process.env.TZ = "America/Los_Angeles";
      const pacific = shanghaiDateTimeLocalToIso("2026-09-10T20:00");
      expect(utc).toBe("2026-09-10T12:00:00.000Z");
      expect(pacific).toBe(utc);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("rejects malformed and impossible local values without normalizing them", () => {
    expect(shanghaiDateTimeLocalToIso("2026-02-30T12:00")).toBeNull();
    expect(shanghaiDateTimeLocalToIso("tomorrow")).toBeNull();
  });
});
