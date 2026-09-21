import type { IntakeResponse } from "@/lib/intakeTypes";
import { SourceBadge } from "./SourceBadge";

const TIER_COPY: Record<string, string> = {
  P1: "Emergency", P2: "Same day", P3: "Next business day", P4: "Scheduled",
};

const STATUS_COPY: Record<string, { title: string; tone: "ok" | "warn" | "stop" }> = {
  dispatchable: { title: "Dispatchable", tone: "ok" },
  dispatchable_with_assumption: { title: "Dispatchable, on a stated assumption", tone: "warn" },
  needs_human: { title: "Not dispatching — needs a human", tone: "stop" },
  out_of_scope: { title: "Not a maintenance request", tone: "stop" },
};

function when(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric",
  });
}

function Row({ label, source, children }: { label: string; source?: "model" | "computed" | "database"; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 py-1.5 max-sm:grid-cols-1">
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className="text-sm">
        {children}
        {source && <SourceBadge source={source} />}
      </dd>
    </div>
  );
}

export function WorkOrderCard({ data }: { data: IntakeResponse }) {
  const { dispatch: d, resolution: r, status } = data;
  const s = STATUS_COPY[status] ?? { title: status, tone: "warn" as const };
  const tone = { ok: "var(--ok)", warn: "var(--warn)", stop: "var(--stop)" }[s.tone];

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] px-4 py-3">
        <span className="inline-flex h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
        <h2 className="text-sm font-semibold">{s.title}</h2>
        <span className="text-xs text-[var(--muted)]">{data.location.name}</span>
      </header>

      {data.reasons.length > 0 && (
        <ul className="space-y-1 border-b border-[var(--border)] bg-[var(--chip)] px-4 py-3">
          {data.reasons.map((x) => (
            <li key={x.code} className="text-xs leading-relaxed">
              <span className="font-mono text-[11px] text-[var(--muted)]">{x.code}</span> — {x.detail}
            </li>
          ))}
        </ul>
      )}

      <dl className="divide-y divide-[var(--border)] px-4 py-2">
        <Row label="Trade" source="database">
          <span className="font-medium">{d.trade ?? "—"}</span>
          {data.tradeDisagreement && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              model proposed <em>{data.tradeDisagreement.modelProposed}</em> at{" "}
              {data.tradeDisagreement.modelConfidence.toFixed(2)} — routed on the asset record
            </p>
          )}
        </Row>

        <Row label="Urgency" source="computed">
          <span className="font-medium">{d.tier}</span>{" "}
          <span className="text-[var(--muted)]">{TIER_COPY[d.tier]}</span>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{d.rationale.text}</p>
        </Row>

        <Row label="Respond by" source="computed">
          <span className="font-medium">{when(d.respondBy, data.location.timezone)}</span>
          <span className="ml-2 text-xs text-[var(--muted)]">{d.respondByBasis.replace(/_/g, " ")}</span>
        </Row>

        <Row label="Asset" source={r.kind === "match" ? "database" : "computed"}>
          {r.kind === "match" ? (
            <>
              <span className="font-medium">{r.asset!.label}</span>
              <span className="ml-2 text-xs text-[var(--muted)]">matched on “{r.matchedOn}”</span>
            </>
          ) : r.kind === "none" ? (
            <span className="text-[var(--muted)]">No asset matched “{data.facts.descriptor ?? "—"}”</span>
          ) : (
            <span className="text-[var(--muted)]">
              {r.candidates.length} candidates — {r.candidates.map((c) => c.label).join(" · ")}
            </span>
          )}
        </Row>

        {r.branches.length > 0 && (
          <Row label="Branches" source="computed">
            <ul className="space-y-1">
              {r.branches.map((b) => (
                <li key={b.trade} className="text-sm">
                  <span className="font-medium">{b.trade}</span>{" "}
                  <span className="text-[var(--muted)]">
                    {b.candidates.length ? b.candidates.map((c) => c.label).join(", ") : b.note}
                  </span>
                </li>
              ))}
            </ul>
          </Row>
        )}

        <Row label="Bring">
          <ul className="space-y-0.5">
            {d.bring.map((i) => (
              <li key={i.item} className="text-sm">
                {i.item}
                <SourceBadge source={i.source === "asset_record" ? "database" : "computed"} />
              </li>
            ))}
          </ul>
          {d.bringPrecision === "trade_generic" && (
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--warn-fg)]">
              This is a trade-level kit, not an asset-specific list. Nothing in the
              parts catalog covers this equipment and symptom, so it is not
              pretending to be precise.
            </p>
          )}
        </Row>

        {d.warranty.note && <Row label="Warranty" source="database">{d.warranty.note}</Row>}

        {data.facts.businessImpact && (
          <Row label="Impact" source="model">{data.facts.businessImpact}</Row>
        )}

        {data.facts.suspectedCauses.length > 0 && (
          <Row label="Likely causes" source="model">
            <ul className="list-disc space-y-0.5 pl-4">
              {data.facts.suspectedCauses.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Row>
        )}

        {data.facts.whatWouldChangeMyMind && (
          <Row label="Would change this" source="model">{data.facts.whatWouldChangeMyMind}</Row>
        )}

        {data.facts.unknownSymptomTexts.length > 0 && (
          <Row label="Unnamed symptom" source="model">
            {data.facts.unknownSymptomTexts.map((t) => <p key={t}>“{t}”</p>)}
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Not in the symptom vocabulary, so no parts list was guessed from it.
              If this is common for you it is a one-line addition to the catalog.
            </p>
          </Row>
        )}
      </dl>

      {data.assumptions.length > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--chip)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Assumptions</p>
          <ul className="mt-1 space-y-1">
            {data.assumptions.map((a) => (
              <li key={a.kind} className="text-xs leading-relaxed">{a.detail}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
