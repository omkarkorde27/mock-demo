/**
 * Pushes seed rows into Supabase.
 *
 * supabase/seed.sql stays the single source of truth: scripts/seed.sh applies
 * it to a throwaway local Postgres, dumps the resulting rows as JSON, and this
 * uploads them. Postgres parses its own array literals, so there is no second
 * copy of the data and nothing to drift.
 */
import { readFileSync } from "node:fs";
import { getDb } from "../lib/db/client";

async function main() {
  const [locPath, assetPath] = process.argv.slice(2);
  if (!locPath || !assetPath) throw new Error("usage: push-seed <locations.json> <assets.json>");

  const locations = JSON.parse(readFileSync(locPath, "utf8"));
  const assets = JSON.parse(readFileSync(assetPath, "utf8"));
  const db = getDb();

  const { error: locErr } = await db.from("location").upsert(locations, { onConflict: "id" });
  if (locErr) throw new Error(`location upsert failed: ${locErr.message}`);
  console.log(`locations upserted: ${locations.length}`);

  const { error: assetErr } = await db.from("asset").upsert(assets, { onConflict: "id" });
  if (assetErr) throw new Error(`asset upsert failed: ${assetErr.message}`);
  console.log(`assets upserted:    ${assets.length}`);

  const { count } = await db.from("asset").select("*", { count: "exact", head: true });
  console.log(`assets now in database: ${count}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
