import { getDb } from "./client";

/**
 * Rate limiting for a public demo link.
 *
 * In-memory counters do not survive serverless invocations, so this counts
 * rows in Postgres instead -- specifically `work_order`, which means no extra
 * table and no second DDL step. One intake is one row, so the row count IS the
 * request count.
 *
 * Deliberately a GLOBAL cap rather than per-IP. The risk being managed is
 * total spend against one API key, not fairness between users; per-tenant
 * limits are a thing you build once you have tenants, which needs auth this
 * prototype does not have. The real backstop is the hard spend cap set on the
 * Anthropic key itself -- this is the polite layer in front of it.
 */
export const HOURLY_INTAKE_CAP = 100;
const WINDOW_MS = 60 * 60 * 1000;

export type RateLimitState = {
  allowed: boolean;
  used: number;
  cap: number;
  retryAfterSeconds: number;
};

export async function checkIntakeRate(now = new Date()): Promise<RateLimitState> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();

  // Not head:true -- a HEAD response carries no body for the client to parse an
  // error from, which is how a 404 once read as success here.
  const { count, error } = await getDb()
    .from("work_order")
    .select("id", { count: "exact" })
    .gte("created_at", since)
    .limit(1);

  // Fail open on a counting error rather than taking the demo down. The spend
  // cap on the key is the guarantee; this is convenience.
  if (error) {
    return { allowed: true, used: 0, cap: HOURLY_INTAKE_CAP, retryAfterSeconds: 0 };
  }

  const used = count ?? 0;
  return {
    allowed: used < HOURLY_INTAKE_CAP,
    used,
    cap: HOURLY_INTAKE_CAP,
    retryAfterSeconds: used < HOURLY_INTAKE_CAP ? 0 : 600,
  };
}
