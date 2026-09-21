import { NextResponse } from "next/server";
import { dbConfigStatus, getDb } from "@/lib/db/client";

// Must actually run on every request. A statically-evaluated route would pass at
// build time and tell us nothing about the deployed runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deploy-early canary.
 *
 * This exists to be deployed on day one, before there is anything to lose, and
 * it performs a real query on purpose. A hello-world route proves the Vercel
 * pipeline works but says nothing about whether the database is reachable from a
 * serverless invocation -- which is exactly the class of bug that otherwise
 * surfaces at 11pm on day two.
 */
export async function GET() {
  const startedAt = Date.now();
  const config = dbConfigStatus();

  if (!config.configured) {
    return NextResponse.json(
      {
        ok: false,
        stage: "config",
        missing: config.missing,
        hint: "Copy .env.local.example to .env.local, or set these in Vercel project settings.",
      },
      { status: 503 },
    );
  }

  try {
    const db = getDb();

    // NOT head:true. A HEAD response has no body, so supabase-js has nothing to
    // parse an error out of -- a 404 for a missing table comes back as
    // {error: null, count: null} and reads as success. This canary reported
    // "ok" against an entirely empty project for two days because of that.
    // Always request a body so failures are visible.
    const TABLES = ["location", "asset", "work_order", "event"] as const;
    const results = await Promise.all(
      TABLES.map(async (table) => {
        const { error, count } = await db
          .from(table)
          .select("id", { count: "exact" })
          .limit(1);
        return { table, error, count: count ?? 0 };
      }),
    );

    const missing = results.filter(
      (r) => r.error?.code === "42P01" || r.error?.code === "PGRST205",
    );
    const failed = results.filter((r) => r.error && !missing.includes(r));

    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          stage: "schema",
          reachable: true,
          missingTables: missing.map((m) => m.table),
          hint: "Connection works. Run supabase/schema.sql in the Supabase SQL editor, then `npm run seed`.",
          ms: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    if (failed.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          stage: "query",
          reachable: true,
          errors: failed.map((f) => ({ table: f.table, code: f.error!.code, message: f.error!.message })),
          ms: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    const counts = Object.fromEntries(results.map((r) => [r.table, r.count]));
    const assetCount = counts.asset ?? 0;

    // Tables exist but no data is not "ready" -- every scenario would resolve
    // to `none` and the UI would look broken for a reason that is not the UI.
    if (assetCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          stage: "unseeded",
          reachable: true,
          counts,
          hint: "Schema is applied but there are no assets. Run `npm run seed`.",
          ms: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      stage: "ready",
      reachable: true,
      counts,
      assetCount,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: "connect",
        reachable: false,
        error: { message: err instanceof Error ? err.message : String(err) },
        ms: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
