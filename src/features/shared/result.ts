export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]>; code?: "PERMISSION_DENIED" | "MUTATION_PENDING" };
