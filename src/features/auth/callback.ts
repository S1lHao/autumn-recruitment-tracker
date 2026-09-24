import { parseEmail } from "./schemas";

export const INVALID_LINK = "/login?error=invalid_link";

type CallbackUser = { id: string; email: string; emailConfirmedAt: string | null };

export type CallbackDependencies = {
  exchangeCode: (code: string) => Promise<boolean>;
  verifyToken: (tokenHash: string, type: "email" | "invite") => Promise<boolean>;
  getVerifiedUser: () => Promise<CallbackUser | null>;
  hasMembership: (userId: string) => Promise<boolean>;
  acceptPendingInvitation: () => Promise<boolean>;
  bootstrapWorkspace: (userId: string, email: string) => Promise<boolean>;
  initialAdminEmail: string;
};

export type CallbackParameters = {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
};

function isSupportedTokenType(type: string | null | undefined): type is "email" | "invite" {
  return type === "email" || type === "invite";
}

/** Resolves to a fixed local destination, never a user-supplied redirect. */
export async function completeAuthCallback(
  parameters: CallbackParameters,
  dependencies: CallbackDependencies,
): Promise<"/" | typeof INVALID_LINK> {
  const authenticated = parameters.code
    ? await dependencies.exchangeCode(parameters.code)
    : parameters.tokenHash && isSupportedTokenType(parameters.type)
      ? await dependencies.verifyToken(parameters.tokenHash, parameters.type)
      : false;
  if (!authenticated) return INVALID_LINK;

  const user = await dependencies.getVerifiedUser();
  const parsedEmail = parseEmail(user?.email);
  if (!user || !user.emailConfirmedAt || !parsedEmail.success) return INVALID_LINK;
  const email = parsedEmail.data;

  if (await dependencies.hasMembership(user.id)) return "/";

  const membershipCreated =
    email === dependencies.initialAdminEmail
      ? await dependencies.bootstrapWorkspace(user.id, email)
      : await dependencies.acceptPendingInvitation();
  if (!membershipCreated || !(await dependencies.hasMembership(user.id))) {
    return INVALID_LINK;
  }

  return "/";
}
