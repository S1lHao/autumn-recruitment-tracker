import { z } from "zod";

const MAXIMUM_GRANT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_EXPIRY = "请选择未来 30 天内的到期时间";

function grantSchema(now: () => Date) {
  return z
    .object({
      granteeId: z.string().uuid("请选择有效的成员"),
      expiresAt: z
        .string()
        .datetime({ offset: true, message: "请输入包含时区的有效到期时间" })
        .transform((value) => new Date(value).toISOString()),
    })
    .strict()
    .superRefine((value, context) => {
      const current = now().getTime();
      const expiry = new Date(value.expiresAt).getTime();
      if (expiry <= current || expiry > current + MAXIMUM_GRANT_DURATION_MS) {
        context.addIssue({ code: "custom", path: ["expiresAt"], message: INVALID_EXPIRY });
      }
    });
}

/** Grant timestamps are absolute ISO-8601 instants; the UI labels its local Asia/Shanghai input. */
export const grantInput = grantSchema(() => new Date());

export const revokeGrantInput = z.object({
  grantId: z.string().uuid("编辑授权无效"),
});

export function parseGrantInput(value: unknown, now: Date = new Date()) {
  return grantSchema(() => now).safeParse(value);
}

export type EditGrant = {
  id: string;
  workspaceId: string;
  ownerId: string;
  granteeId: string;
  expiresAt: string;
};
