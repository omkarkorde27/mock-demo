"use client";

export const SCENARIOS: { label: string; text: string; hint?: string }[] = [
  { label: "Walk-in at 52°", text: "walk in has been at 52 since last night, food is gonna spoil, we open at 11", hint: "resolves cleanly — asks nothing" },
  { label: "“The fridge” at 52°", text: "the fridge is at 52, food is gonna spoil, we open at 11", hint: "same problem, vaguer words — asks which one" },
  { label: "Fryer won't heat", text: "fryer won't heat up, we open in an hour" },
  { label: "Grease trap backing up", text: "grease trap is backing up into the dish pit, smells awful" },
  { label: "Card reader offline", text: "card reader won't connect, we can't take any payments at all" },
  { label: "No hot water", text: "no hot water in the dish pit and the health inspector is coming thursday" },
  { label: "Burning smell", text: "there's a burning smell in the kitchen and we can't find where it's coming from", hint: "urgent and undecidable — enumerates, won't pick" },
];

export const FAILURES: { label: string; text: string }[] = [
  { label: "Vague request", text: "something's wrong in the back" },
  { label: "Not a maintenance issue", text: "what time does the mail usually come" },
  { label: "Unfamiliar symptom", text: "the thing by the back door is making a weird warbling sound I've never heard before" },
];

export function ScenarioChips({
  onPick, disabled,
}: { onPick: (text: string) => void; disabled: boolean }) {
  const chip =
    "rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--fg-subtle)] disabled:opacity-50";
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Try a real request</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button key={s.label} type="button" disabled={disabled} onClick={() => onPick(s.text)} title={s.hint ?? s.text} className={chip}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Watch it fail on purpose
        </p>
        <div className="flex flex-wrap gap-2">
          {FAILURES.map((s) => (
            <button key={s.label} type="button" disabled={disabled} onClick={() => onPick(s.text)} title={s.text}
              className={`${chip} border-dashed`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
