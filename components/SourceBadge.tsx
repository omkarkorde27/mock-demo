import type { ProvenanceSource } from "@/lib/dispatch/provenance";

const STYLE: Record<ProvenanceSource, { bg: string; fg: string; label: string; title: string }> = {
  model: { bg: "var(--badge-model-bg)", fg: "var(--badge-model-fg)", label: "model",
    title: "Extracted by the language model from the intake text." },
  computed: { bg: "var(--badge-computed-bg)", fg: "var(--badge-computed-fg)", label: "computed",
    title: "Produced by a pure function. Same inputs always give this answer." },
  database: { bg: "var(--badge-db-bg)", fg: "var(--badge-db-fg)", label: "database",
    title: "Read straight from the asset or location record." },
};

/** The decision boundary, made visible without reading a word of the note. */
export function SourceBadge({ source }: { source: ProvenanceSource }) {
  const s = STYLE[source];
  return (
    <span
      title={s.title}
      className="ml-2 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
