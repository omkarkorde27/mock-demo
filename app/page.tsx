"use client";

import { useState } from "react";
import { ScenarioChips } from "@/components/ScenarioChips";
import { SuppressedQuestions } from "@/components/SuppressedQuestions";
import { TraceFooter } from "@/components/TraceFooter";
import { WorkOrderCard } from "@/components/WorkOrderCard";
import { FollowUp } from "@/components/FollowUp";
import type { IntakeResponse } from "@/lib/intakeTypes";

export default function Home() {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    const body = value.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setResult(json as IntakeResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--muted)]">
          Prototype · synthetic data
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Intake → dispatchable work order
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          A manager types the way a manager actually types. One model call reads
          it; everything after that is pure TypeScript. It asks a follow-up only
          when the answer would change who gets dispatched — and it shows you
          what it decided <em>not</em> to ask.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        <ScenarioChips
          disabled={pending}
          onPick={(t) => { setText(t); void submit(t); }}
        />

        <form
          onSubmit={(e) => { e.preventDefault(); void submit(text); }}
          className="space-y-2"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={pending}
            placeholder="walk in has been at 52 since last night, food is gonna spoil, we open at 11"
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[15px] leading-relaxed outline-none placeholder:text-[var(--fg-subtle)] focus:border-[var(--fg-subtle)] disabled:opacity-60"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition-opacity disabled:opacity-40"
            >
              {pending ? "Reading…" : "Create work order"}
            </button>
            {pending && (
              <span className="text-xs text-[var(--muted)]">
                one model call, then the deterministic steps
              </span>
            )}
          </div>
        </form>
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--stop)]">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-8 space-y-4">
          <WorkOrderCard data={result} />
          {result.asked && (
            <FollowUp
              asked={result.asked}
              assumption={result.assumptions[0]?.detail ?? null}
              pending={pending}
              onAnswer={() => { /* answer route lands in the next phase */ }}
            />
          )}
          <SuppressedQuestions items={result.suppressed} />
          <TraceFooter trace={result.trace} />
        </div>
      )}
    </main>
  );
}
