import { NextResponse } from "next/server";
import { askGate } from "@/lib/dispatch/askGate";
import { DISPATCH_PROVENANCE } from "@/lib/dispatch/dispatchFor";
import { gate } from "@/lib/dispatch/gate";
import { resolveAsset, type ResolvableAsset } from "@/lib/dispatch/resolveAsset";
import { WARRANTY_PROVENANCE } from "@/lib/dispatch/warrantyFlag";
import { assetsAtLocation, listLocations } from "@/lib/db/assets";
import { appendEvents } from "@/lib/db/events";
import { checkIntakeRate } from "@/lib/db/rateLimit";
import { insertWorkOrder } from "@/lib/db/workOrders";
import { extractFacts, PROMPT_VERSION } from "@/lib/llm/extract";
import type { Trade } from "@/lib/llm/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INTAKE_CHARS = 2000;

/** Branches for the multi-trade case, INCLUDING trades with no asset on record. */
function branchesFor(trades: Trade[], candidates: ResolvableAsset[]) {
  return trades.map((trade) => ({
    trade,
    candidates: candidates
      .filter((c) => c.trade === trade)
      .map((c) => ({ id: c.id, label: c.label })),
    // Harbor has no electrical asset by design. Dropping the branch silently
    // would hide a trade the model actually proposed.
    note:
      candidates.some((c) => c.trade === trade)
        ? null
        : "No asset of this trade on record at this location.",
  }));
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  let body: { text?: unknown; locationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "`text` is required." }, { status: 400 });
  }
  if (text.length > MAX_INTAKE_CHARS) {
    return NextResponse.json(
      { error: `Intake is limited to ${MAX_INTAKE_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const locations = await listLocations();
    if (locations.length === 0) {
      return NextResponse.json(
        { error: "No locations are seeded. Run `npm run seed`." },
        { status: 503 },
      );
    }
    const location =
      locations.find((l) => l.id === body.locationId) ??
      locations.find((l) => l.name.startsWith("Harbor")) ??
      locations[0];

    const assets = await assetsAtLocation(location.id);

    // Checked before the model call, because the model call is the cost.
    const rate = await checkIntakeRate();
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error:
            `This demo is capped at ${rate.cap} intakes an hour and has used ${rate.used}. ` +
            `It is a public link with a real API key behind it, so the cap is the point. Try again shortly.`,
          rateLimited: true,
        },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    // ---- the one model call ----
    const extraction = await extractFacts(text);
    const f = extraction.value;

    // ---- everything below is pure + database reads ----
    const resolution = resolveAsset(f.assetDescriptor, f.tradeCandidates, assets);

    const gateResult = gate({
      isMaintenanceRequest: f.isMaintenanceRequest,
      confidence: f.confidence,
      hasUnnameableSymptom: f.symptoms.some((s) => s.code === "other"),
      tradeCandidateCount: f.tradeCandidates.length,
      resolution,
    });

    const askResult = askGate({
      facts: {
        safetyHazard: f.safetyHazard,
        serviceBlocking: f.serviceBlocking,
        lossInProgress: f.lossInProgress,
        equipmentInoperable: f.equipmentInoperable,
        workaroundExists: f.workaroundExists,
        symptomCodes: f.symptoms.map((s) => s.code),
        deadline: f.deadline,
        fallbackTrade: f.tradeCandidates[0]?.trade ?? null,
      },
      confidence: f.confidence,
      uncertainFields: f.uncertainFields,
      resolution,
      location,
      now: new Date(),
      // An assumption sentence about how this was dispatched is false when
      // nothing is being dispatched.
      dispatching:
        gateResult.status === "dispatchable" ||
        gateResult.status === "dispatchable_with_assumption",
    });

    const dispatch = askResult.baseline;
    const resolvedAssetId = resolution.kind === "match" ? resolution.asset.id : null;
    const tradeDisagreement =
      resolution.kind === "match" ? resolution.tradeDisagreement : null;

    const assumptions = [
      ...(askResult.assumption ? [{ kind: "unanswered_question", detail: askResult.assumption }] : []),
      ...gateResult.reasons
        .filter((r) => r.code === "asset_unresolved")
        .map((r) => ({ kind: "asset_unresolved", detail: r.detail })),
      ...(dispatch.respondBy.degraded
        ? [{ kind: "degraded_deadline", detail: "A specific deadline was claimed at intake but no time was given." }]
        : []),
    ];

    // ---- persist: current state, then the history that produced it ----
    const workOrderId = await insertWorkOrder({
      locationId: location.id,
      assetId: resolvedAssetId,
      rawIntakeText: text,
      facts: f,
      dispatch,
      gateResult,
      assumptions,
      modelVersion: extraction.model,
      promptVersion: PROMPT_VERSION,
    });

    await appendEvents([
      { workOrderId, type: "intake_received", actor: "manager", payload: { text } },
      {
        workOrderId,
        type: "classified",
        actor: "model",
        payload: {
          resolution: resolution.kind,
          tier: dispatch.tier,
          tierRule: dispatch.tierRule,
          status: gateResult.status,
          confidence: f.confidence,
          promptVersion: PROMPT_VERSION,
          usage: extraction.usage,
        },
      },
      ...(tradeDisagreement
        ? [{ workOrderId, type: "trade_disagreement" as const, actor: "system" as const, payload: { ...tradeDisagreement } }]
        : []),
      ...(askResult.asked
        ? [{ workOrderId, type: "question_asked" as const, actor: "system" as const, payload: { field: askResult.asked.field, changes: askResult.asked.changes } }]
        : []),
      ...(gateResult.status === "needs_human"
        ? [{ workOrderId, type: "escalated" as const, actor: "system" as const, payload: { reasons: gateResult.reasons } }]
        : []),
    ]);

    return NextResponse.json({
      workOrderId,
      location: { id: location.id, name: location.name, opensAt: location.opensAt, timezone: location.timezone },
      intake: text,
      status: gateResult.status,
      reasons: gateResult.reasons,
      resolution: {
        kind: resolution.kind,
        matchedOn: resolution.kind === "match" ? resolution.matchedOn : null,
        asset: resolution.kind === "match"
          ? { id: resolution.asset.id, label: resolution.asset.label, type: resolution.asset.type, trade: resolution.asset.trade }
          : null,
        candidates: resolution.kind === "ambiguous_same_trade" || resolution.kind === "ambiguous_cross_trade"
          ? resolution.candidates.map((c) => ({ id: c.id, label: c.label, trade: c.trade }))
          : [],
        branches: resolution.kind === "ambiguous_cross_trade"
          ? branchesFor(resolution.trades, resolution.candidates)
          : [],
      },
      tradeDisagreement,
      dispatch: {
        trade: dispatch.trade,
        tier: dispatch.tier,
        tierRule: dispatch.tierRule,
        respondBy: dispatch.respondBy.at.toISOString(),
        respondByBasis: dispatch.respondBy.basis,
        rationale: dispatch.rationale,
        bring: dispatch.bring,
        bringPrecision: dispatch.bringPrecision,
        warranty: dispatch.warranty,
      },
      facts: {
        descriptor: f.assetDescriptor,
        symptoms: f.symptoms,
        unknownSymptomTexts: f.unknownSymptomTexts,
        booleans: {
          safetyHazard: f.safetyHazard, serviceBlocking: f.serviceBlocking,
          lossInProgress: f.lossInProgress, equipmentInoperable: f.equipmentInoperable,
          workaroundExists: f.workaroundExists,
        },
        confidence: f.confidence,
        businessImpact: f.businessImpact,
        suspectedCauses: f.suspectedCauses,
        whatWouldChangeMyMind: f.whatWouldChangeMyMind,
        tradeCandidates: f.tradeCandidates,
      },
      asked: askResult.asked,
      suppressed: askResult.suppressed,
      assumptions,
      provenance: { dispatch: DISPATCH_PROVENANCE, warranty: WARRANTY_PROVENANCE },
      trace: {
        modelCalls: 1,
        modelMs: extraction.ms,
        totalMs: Date.now() - startedAt,
        costUsd: extraction.costUsd,
        model: extraction.model,
        promptVersion: PROMPT_VERSION,
        usage: extraction.usage,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
