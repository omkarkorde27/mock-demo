import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * Deliberately supabase-js (PostgREST over HTTP) rather than a direct Postgres
 * connection string. On Vercel, every serverless invocation that opens its own
 * pooled pg connection will exhaust Supabase's connection limit under any real
 * traffic, while working perfectly on a laptop. HTTP has no pool to exhaust.
 *
 * If a direct driver is ever needed, use the pooler on :6543 in transaction mode.
 */

const URL_VAR = "SUPABASE_URL";
const KEY_VAR = "SUPABASE_SERVICE_ROLE_KEY";

export type ConfigStatus = {
  configured: boolean;
  missing: string[];
};

export function dbConfigStatus(): ConfigStatus {
  const missing: string[] = [];
  if (!process.env[URL_VAR]) missing.push(URL_VAR);
  if (!process.env[KEY_VAR]) missing.push(KEY_VAR);
  return { configured: missing.length === 0, missing };
}

let cached: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (cached) return cached;

  const { configured, missing } = dbConfigStatus();
  if (!configured) {
    throw new Error(
      `Supabase is not configured. Missing: ${missing.join(", ")}. ` +
        `Copy .env.local.example to .env.local and fill it in.`,
    );
  }

  // The service role key bypasses RLS. This is a single-tenant prototype with no
  // auth, so it never leaves the server. RLS + real tenancy is the first thing
  // this would need before anyone else's data touched it.
  cached = createClient(process.env[URL_VAR]!, process.env[KEY_VAR]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
