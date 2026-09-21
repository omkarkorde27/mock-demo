import type { EventActor, EventType } from "../llm/vocab";
import { getDb } from "./client";

/**
 * Append-only by construction here, and by trigger in the database.
 * There is deliberately no update() or delete() in this module -- the only way
 * to change history is to write another row saying what changed.
 */

export type EventInput = {
  workOrderId: string;
  type: EventType;
  actor: EventActor;
  payload?: Record<string, unknown>;
};

export async function appendEvents(events: EventInput[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await getDb().from("event").insert(
    events.map((e) => ({
      work_order_id: e.workOrderId,
      type: e.type,
      actor: e.actor,
      payload: e.payload ?? {},
    })),
  );
  if (error) throw new Error(`appendEvents: ${error.message}`);
}

export async function eventsFor(workOrderId: string) {
  const { data, error } = await getDb()
    .from("event")
    .select("id,type,actor,payload,created_at")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`eventsFor: ${error.message}`);
  return data;
}
