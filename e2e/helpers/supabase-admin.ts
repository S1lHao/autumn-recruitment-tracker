import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const LOCAL_SUPABASE_ORIGIN = "http://127.0.0.1:54321";
const LOCAL_SITE_ORIGIN = "http://127.0.0.1:3000";
declare const validatedEnvironment: unique symbol;

type Environment = Record<string, string | undefined>;
type SetCookieParam = Parameters<BrowserContext["addCookies"]>[0][number];

export type E2EEnvironment = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  siteUrl: string;
  initialAdminEmail: string;
};

type ValidatedE2EEnvironment = E2EEnvironment & {
  readonly [validatedEnvironment]: true;
};

type SeededIds = {
  workspaceId: string;
  ownerId: string;
  teammateId: string;
  ownerApplicationId: string;
  teammateApplicationId: string;
};

export type RecruitmentFixture = SeededIds & {
  runId: string;
  ownerEmail: string;
  teammateEmail: string;
  ownerStatePath: string;
  teammateStatePath: string;
  seedActiveGrant: () => Promise<string>;
  expireGrant: (grantId: string) => Promise<void>;
  revokeGrant: (grantId: string) => Promise<void>;
  cleanup: () => Promise<void>;
};

function parseCanonicalLocalUrl(value: string, purpose: string, canonicalOrigin: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${purpose} must be a valid URL`);
  }
  if (
    (value !== canonicalOrigin && value !== `${canonicalOrigin}/`) ||
    parsed.origin !== canonicalOrigin ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${purpose} must be exactly ${canonicalOrigin} (an optional trailing slash is allowed)`);
  }
  return parsed;
}

/** Refuses any target that could plausibly be a shared or production Supabase project. */
export function assertLocalSupabaseUrl(value: string) {
  return parseCanonicalLocalUrl(value, "local Supabase API", LOCAL_SUPABASE_ORIGIN);
}

/** The E2E web server is always a fresh Next.js process on the dedicated local port. */
export function assertLocalSiteUrl(value: string) {
  return parseCanonicalLocalUrl(value, "local Next.js server", LOCAL_SITE_ORIGIN);
}

function required(environment: Environment, key: string) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`E2E prerequisite missing: ${key}`);
  return value;
}

export function loadE2EEnvironment(environment: Environment = process.env): E2EEnvironment {
  return validateE2EEnvironment({
    supabaseUrl: required(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required(environment, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: required(environment, "SUPABASE_SERVICE_ROLE_KEY"),
    siteUrl: required(environment, "NEXT_PUBLIC_SITE_URL"),
    initialAdminEmail: required(environment, "INITIAL_ADMIN_EMAIL").toLowerCase(),
  });
}

/** Revalidates even explicitly constructed objects before any client or network operation. */
export function validateE2EEnvironment(environment: E2EEnvironment): ValidatedE2EEnvironment {
  const supabaseUrl = assertLocalSupabaseUrl(environment.supabaseUrl).origin;
  const siteUrl = assertLocalSiteUrl(environment.siteUrl).origin;
  const anonKey = environment.anonKey?.trim();
  const serviceRoleKey = environment.serviceRoleKey?.trim();
  const initialAdminEmail = environment.initialAdminEmail?.trim().toLowerCase();
  if (!anonKey) throw new Error("E2E prerequisite missing: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) throw new Error("E2E prerequisite missing: SUPABASE_SERVICE_ROLE_KEY");
  if (!initialAdminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(initialAdminEmail)) {
    throw new Error("E2E prerequisite invalid: INITIAL_ADMIN_EMAIL");
  }
  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    siteUrl,
    initialAdminEmail,
  } as ValidatedE2EEnvironment;
}

function adminClient(environment: ValidatedE2EEnvironment) {
  return createClient(environment.supabaseUrl, environment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireNoError(error: unknown, operation: string) {
  if (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${operation} failed: ${detail}`);
  }
}

async function writeAuthenticatedState(
  browser: Browser,
  environment: ValidatedE2EEnvironment,
  email: string,
  password: string,
  statePath: string,
) {
  const authClient = createClient(environment.supabaseUrl, environment.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  await requireNoError(error, `authenticate ${email}`);
  if (!data.session) throw new Error(`authenticate ${email} returned no session`);

  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const ssrClient = createServerClient(environment.supabaseUrl, environment.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        pendingCookies.splice(0, pendingCookies.length, ...cookies);
      },
    },
  });
  const { error: sessionError } = await ssrClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  await requireNoError(sessionError, `serialize ${email} session`);
  if (pendingCookies.length === 0) throw new Error(`serialize ${email} session produced no auth cookies`);

  const context = await browser.newContext();
  try {
    const cookies: SetCookieParam[] = pendingCookies.map(({ name, value, options }) => ({
      name,
      value,
      url: environment.siteUrl,
      httpOnly: options.httpOnly === true,
      secure: new URL(environment.siteUrl).protocol === "https:",
      sameSite: options.sameSite === "strict" ? "Strict" : options.sameSite === "none" ? "None" : "Lax",
      expires: typeof options.maxAge === "number" ? Math.floor(Date.now() / 1000) + options.maxAge : -1,
    }));
    await context.addCookies(cookies);
    const page = await context.newPage();
    const response = await page.goto(environment.siteUrl, { waitUntil: "domcontentloaded" });
    if (!response?.ok() || new URL(page.url()).pathname === "/login") {
      throw new Error(`authenticated state verification failed for ${email}`);
    }
    await mkdir(path.dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
  } finally {
    await context.close();
  }
}

async function removeFixtureRows(admin: SupabaseClient, workspaceId: string, userIds: readonly string[]) {
  const failures: string[] = [];
  for (const table of ["edit_grants", "applications", "invitations", "workspace_members"] as const) {
    const { error } = await admin.from(table).delete().eq("workspace_id", workspaceId);
    if (error) failures.push(`${table}: ${error.message}`);
  }
  const { error: workspaceError } = await admin.from("workspaces").delete().eq("id", workspaceId);
  if (workspaceError) failures.push(`workspaces: ${workspaceError.message}`);
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) failures.push(`auth.users ${userId}: ${error.message}`);
  }
  if (failures.length) throw new Error(`E2E cleanup failed (${failures.join("; ")})`);
}

/** A failed teardown remains retryable; concurrent callers share the in-flight attempt. */
export function createRetryableCleanup(operation: () => Promise<void>) {
  let complete = false;
  let inFlight: Promise<void> | null = null;
  return async () => {
    if (complete) return;
    if (inFlight) return inFlight;
    inFlight = operation()
      .then(() => {
        complete = true;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

/** Waits for every operation before reporting any failure. */
export async function settleSetupOperations(operations: readonly Promise<unknown>[]) {
  const results = await Promise.allSettled(operations);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length) throw new AggregateError(failures, "parallel E2E setup failed");
}

export async function runSetupWithCleanup<T>(setup: () => Promise<T>, cleanup: () => Promise<void>) {
  try {
    return await setup();
  } catch (setupError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([setupError, cleanupError], "E2E setup and cleanup both failed");
    }
    throw setupError;
  }
}

export async function createRecruitmentFixture(
  browser: Browser,
  environment: E2EEnvironment = loadE2EEnvironment(),
): Promise<RecruitmentFixture> {
  const safeEnvironment = validateE2EEnvironment(environment);
  // Random IDs and a run-specific email namespace keep retries and parallel CI jobs isolated.
  const runId = `${Date.now()}-${randomBytes(6).toString("hex")}`;
  const workspaceId = randomUUID();
  const ownerId = randomUUID();
  const teammateId = randomUUID();
  const ownerApplicationId = randomUUID();
  const teammateApplicationId = randomUUID();
  const ownerEmail = `owner+${runId}@example.test`;
  const teammateEmail = `teammate+${runId}@example.test`;
  const password = `${randomBytes(18).toString("base64url")}Aa1!`;
  const stateDirectory = path.resolve("test-results", "auth", runId);
  const ownerStatePath = path.join(stateDirectory, "owner.json");
  const teammateStatePath = path.join(stateDirectory, "teammate.json");
  const admin = adminClient(safeEnvironment);
  const createdUserIds: string[] = [];
  const cleanup = createRetryableCleanup(() => removeFixtureRows(admin, workspaceId, createdUserIds));

  await runSetupWithCleanup(async () => {
    for (const account of [
      { id: ownerId, email: ownerEmail, displayName: `Owner ${runId}` },
      { id: teammateId, email: teammateEmail, displayName: `Teammate ${runId}` },
    ]) {
      const { error } = await admin.auth.admin.createUser({
        id: account.id,
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: account.displayName },
      });
      await requireNoError(error, `create ${account.email}`);
      createdUserIds.push(account.id);
    }

    let result = await admin.from("profiles").insert([
      { id: ownerId, email: ownerEmail, display_name: `Owner ${runId}` },
      { id: teammateId, email: teammateEmail, display_name: `Teammate ${runId}` },
    ]);
    await requireNoError(result.error, "seed profiles");
    result = await admin.from("workspaces").insert({
      id: workspaceId,
      name: `E2E workspace ${runId}`,
      created_by: ownerId,
    });
    await requireNoError(result.error, "seed workspace");
    result = await admin.from("workspace_members").insert([
      { workspace_id: workspaceId, user_id: ownerId, role: "admin" },
      { workspace_id: workspaceId, user_id: teammateId, role: "member" },
    ]);
    await requireNoError(result.error, "seed memberships");
    result = await admin.from("applications").insert([
      {
        id: ownerApplicationId,
        workspace_id: workspaceId,
        owner_id: ownerId,
        company: `Owner Corp ${runId}`,
        role: "Backend Engineer",
        location: "上海",
        stage: "面试",
        next_step: "技术面",
        notes: "owner-only application",
      },
      {
        id: teammateApplicationId,
        workspace_id: workspaceId,
        owner_id: teammateId,
        company: `Teammate Labs ${runId}`,
        role: "Product Engineer",
        location: "北京",
        stage: "已投递",
        next_step: "等待笔试",
        notes: "teammate-only application",
      },
    ]);
    await requireNoError(result.error, "seed applications");

    await settleSetupOperations([
      writeAuthenticatedState(browser, safeEnvironment, ownerEmail, password, ownerStatePath),
      writeAuthenticatedState(browser, safeEnvironment, teammateEmail, password, teammateStatePath),
    ]);
  }, cleanup);

  return {
    runId,
    workspaceId,
    ownerId,
    teammateId,
    ownerApplicationId,
    teammateApplicationId,
    ownerEmail,
    teammateEmail,
    ownerStatePath,
    teammateStatePath,
    async seedActiveGrant() {
      const grantId = randomUUID();
      const { error } = await admin.from("edit_grants").insert({
        id: grantId,
        workspace_id: workspaceId,
        owner_id: ownerId,
        grantee_id: teammateId,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      await requireNoError(error, "seed active edit grant");
      return grantId;
    },
    async expireGrant(grantId) {
      const { data, error } = await admin
        .from("edit_grants")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", grantId)
        .eq("workspace_id", workspaceId)
        .select("id")
        .single();
      await requireNoError(error, "expire edit grant");
      if (data?.id !== grantId) throw new Error("expire edit grant affected the wrong row");
    },
    async revokeGrant(grantId) {
      const { data, error } = await admin
        .from("edit_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", grantId)
        .eq("workspace_id", workspaceId)
        .select("id")
        .single();
      await requireNoError(error, "revoke edit grant");
      if (data?.id !== grantId) throw new Error("revoke edit grant affected the wrong row");
    },
    cleanup,
  };
}
