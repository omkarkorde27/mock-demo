"use client";
import type { Question } from "@/lib/dispatch/askGate";

export function FollowUp({
  asked, assumption, onAnswer, pending,
}: {
  asked: Question;
  assumption: string | null;
  onAnswer: (value: string) => void;
  pending: boolean;
}) {
  return (
    <section className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-semibold">One question</h3>
        <span className="text-xs text-[var(--muted)]">
          asked because it changes {asked.changes.join(", ")}
        </span>
      </div>
      <p className="mt-2 text-[15px]">{asked.question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {asked.options.map((o) => (
          <button key={o.value} type="button" disabled={pending} onClick={() => onAnswer(o.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--fg-subtle)] disabled:opacity-50">
            {o.label}
          </button>
        ))}
      </div>
      {assumption && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">{assumption}</p>
      )}
    </section>
  );
}
