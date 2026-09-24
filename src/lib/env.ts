import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  INITIAL_ADMIN_EMAIL: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
});

type Environment = Record<string, string | undefined>;

/** Validates values required in browser-safe Supabase clients. */
export function parsePublicEnv(environment: Environment = process.env) {
  return publicEnvSchema.parse(environment);
}

/** Validates values that must only be used in server-side code. */
export function parseServerEnv(environment: Environment = process.env) {
  return serverEnvSchema.parse(environment);
}
