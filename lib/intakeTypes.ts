import type { SuppressedQuestion, Question } from "./dispatch/askGate";
import type { BringItem } from "./dispatch/parts";
import type { ProvenanceSource } from "./dispatch/provenance";
import type { Rationale } from "./dispatch/rationale";
import type { WarrantyFlag } from "./dispatch/warrantyFlag";
import type { GateReason } from "./dispatch/gate";
import type { SymptomCode, Trade, UrgencyTier, WorkOrderStatus } from "./llm/vocab";

export type IntakeResponse = {
  workOrderId: string;
  location: { id: string; name: string; opensAt: string; timezone: string };
  intake: string;
  status: WorkOrderStatus;
  reasons: GateReason[];
  resolution: {
    kind: "match" | "ambiguous_same_trade" | "ambiguous_cross_trade" | "none";
    matchedOn: string | null;
    asset: { id: string; label: string; type: string; trade: Trade } | null;
    candidates: { id: string; label: string; trade: Trade }[];
    branches: { trade: Trade; candidates: { id: string; label: string }[]; note: string | null }[];
  };
  tradeDisagreement: { modelProposed: Trade; modelConfidence: number; recordSays: Trade } | null;
  dispatch: {
    trade: Trade | null;
    tier: UrgencyTier;
    tierRule: string;
    respondBy: string;
    respondByBasis: string;
    rationale: Rationale;
    bring: BringItem[];
    bringPrecision: "asset_specific" | "trade_generic";
    warranty: WarrantyFlag;
  };
  facts: {
    descriptor: string | null;
    symptoms: { code: SymptomCode; raw: string }[];
    unknownSymptomTexts: string[];
    booleans: Record<string, boolean>;
    confidence: number;
    businessImpact: string | null;
    suspectedCauses: string[];
    whatWouldChangeMyMind: string | null;
    tradeCandidates: { trade: Trade; confidence: number }[];
  };
  asked: Question | null;
  suppressed: SuppressedQuestion[];
  assumptions: { kind: string; detail: string }[];
  provenance: { dispatch: Record<string, ProvenanceSource>; warranty: Record<string, ProvenanceSource> };
  trace: {
    modelCalls: number; modelMs: number; totalMs: number; costUsd: number;
    model: string; promptVersion: string;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  };
};
