import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("请输入有效的邮箱地址");

export function parseEmail(value: unknown) {
  return emailSchema.safeParse(value);
}
