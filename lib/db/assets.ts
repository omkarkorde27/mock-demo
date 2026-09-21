import type { AssetType, Trade } from "../llm/vocab";
import type { ResolvableAsset } from "../dispatch/resolveAsset";
import type { LocationHours } from "../dispatch/respondBy";
import { getDb } from "./client";

/**
 * Reads the two tables the dispatch chain needs. Nothing here decides
 * anything -- it maps rows onto the shapes the pure layer already expects, so
 * the pure layer never learns what a database row looks like.
 */

export type LocationRow = LocationHours & {
  id: string;
  name: string;
  address: string;
};

type RawLocation = {
  id: string; name: string; address: string; timezone: string;
  opens_at: string; closes_at: string;
};

type RawAsset = {
  id: string; location_id: string; trade: string; type: string; label: string;
  aliases: string[] | null; make: string | null; model: string | null;
  refrigerant_type: string | null; warranty_expires_on: string | null;
};

const toLocation = (r: RawLocation): LocationRow => ({
  id: r.id,
  name: r.name,
  address: r.address,
  timezone: r.timezone,
  // Postgres returns time as HH:MM:SS; parseClock reads HH and MM either way.
  opensAt: r.opens_at,
  closesAt: r.closes_at,
});

const toAsset = (r: RawAsset): ResolvableAsset => ({
  id: r.id,
  trade: r.trade as Trade,
  type: r.type as AssetType,
  label: r.label,
  aliases: r.aliases ?? [],
  make: r.make,
  model: r.model,
  refrigerantType: r.refrigerant_type,
  warrantyExpiresOn: r.warranty_expires_on,
});

export async function listLocations(): Promise<LocationRow[]> {
  const { data, error } = await getDb().from("location").select("*").order("name");
  if (error) throw new Error(`listLocations: ${error.message}`);
  return (data as RawLocation[]).map(toLocation);
}

export async function getLocation(id: string): Promise<LocationRow | null> {
  const { data, error } = await getDb().from("location").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getLocation: ${error.message}`);
  return data ? toLocation(data as RawLocation) : null;
}

export async function assetsAtLocation(locationId: string): Promise<ResolvableAsset[]> {
  const { data, error } = await getDb()
    .from("asset").select("*").eq("location_id", locationId).order("label");
  if (error) throw new Error(`assetsAtLocation: ${error.message}`);
  return (data as RawAsset[]).map(toAsset);
}
