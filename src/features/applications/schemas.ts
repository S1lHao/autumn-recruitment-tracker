import { z } from "zod";
import { APPLICATION_STAGES, type ApplicationInput } from "./types";

const REQUIRED_TEXT = "此项不能为空";
const INVALID_DATE = "请输入有效日期";
const INVALID_DATETIME = "请输入有效截止时间";
const INVALID_URL = "请输入有效的 http 或 https 链接";

function trimmedText(maximum: number, required = false) {
  const schema = z.string().trim().max(maximum, `最多 ${maximum} 个字符`);
  return required ? schema.min(1, REQUIRED_TEXT) : schema;
}

const nullableDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, INVALID_DATE)
    .refine((value) => {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    }, INVALID_DATE)
    .nullable(),
);

const nullableIsoDateTime = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .datetime({ offset: true, message: INVALID_DATETIME })
    .nullable(),
);

const nullableHttpUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .url(INVALID_URL)
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }, INVALID_URL)
    .nullable(),
);

export const applicationInputSchema = z.object({
  company: trimmedText(120, true),
  companyWebsite: nullableHttpUrl,
  role: trimmedText(120, true),
  location: trimmedText(120),
  stage: z.enum(APPLICATION_STAGES),
  appliedOn: nullableDate,
  nextStep: trimmedText(240),
  deadline: nullableIsoDateTime,
  notes: trimmedText(5000),
});

export function parseApplicationInput(value: unknown) {
  return applicationInputSchema.safeParse(value) as z.ZodSafeParseResult<ApplicationInput>;
}
