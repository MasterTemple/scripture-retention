import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { addDays, describeDay, type Day } from "@/core/dates";
import { describePosition, type Verse } from "@/core/schedule";
import { ALGORITHM_INFO, describeInterval, GRADE_NAMES, isPlacing, memoryOf, verseStatus, type LogEntry } from "@/core/srs";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/state/store";

const PRESETS: [string, number][] = [
  ["Tomorrow", 1],
  ["3 days", 3],
  ["1 week", 7],
  ["2 weeks", 14],
  ["1 month", 30],
  ["3 months", 91],
  ["6 months", 182],
  ["1 year", 365],
];

/** How many days until a verse's next review, by steps or a preset, and the day that lands on */
export function IntervalPicker({ days, day, onChange }: { days: number; day: Day; onChange: (days: number) => void }) {
  // What's typed, while it's typed (it may be empty for a moment)
  const [typed, setTyped] = useState<string | null>(null);
  const set = (n: number) => onChange(Math.max(1, Math.min(36500, Math.round(n))));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-40"
          onClick={() => set(days - 1)}
          disabled={days <= 1}
          aria-label="Sooner"
        >
          <MinusIcon className="size-5" />
        </button>
        <label className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-muted/60 text-base">
          <span className="text-muted-foreground">In</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={typed ?? days}
            onChange={(e) => {
              setTyped(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1) set(n);
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => setTyped(null)}
            className="w-16 rounded-md border border-input bg-card py-1 text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            aria-label="Days until the next review"
          />
          <span className="text-muted-foreground">{days === 1 ? "day" : "days"}</span>
        </label>
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground shadow-xs transition-colors hover:bg-muted active:scale-95"
          onClick={() => set(days + 1)}
          aria-label="Later"
        >
          <PlusIcon className="size-5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([label, n]) => (
          <button
            key={n}
            type="button"
            onClick={() => set(n)}
            className={cn(
              "h-9 rounded-full border px-3 text-sm transition-colors sm:h-8",
              n === days ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Next review: {describeDay(addDays(day, days))}</p>
    </div>
  );
}

/** Where a verse is under the adaptive algorithm today, and what it knows of the verse's memory */
export function AdaptiveSummary({ verse, day }: { verse: Verse; day: Day }) {
  const sch = useScheduler();
  const s = verseStatus(verse, day, sch);
  const memory = s.phase === "upcoming" ? [] : memoryOf(verse, day, sch);
  const when = s.phase === "upcoming" ? `Starts ${describeDay(verse.start)}` : s.due ? "Due today" : s.next ? `Next ${describeDay(s.next)}` : null;
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-medium">{s.phase === "upcoming" ? "Upcoming" : describePosition(s)}</span>
        <span className="text-xs text-muted-foreground">{ALGORITHM_INFO[sch.algorithm].name}</span>
      </div>
      {when && <div className={cn(s.due ? "font-semibold text-primary" : "text-muted-foreground")}>{when}</div>}
      {memory.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {memory.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn("tabular-nums", label === "Leech" && "font-semibold text-destructive")}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const describeEntry = (e: LogEntry) =>
  isPlacing(e) ? (e.set === 0 ? "Started over as new" : `Placed: next in ${describeInterval(e.set)}`) : GRADE_NAMES[e.grade];

/** A verse's reviews, newest first */
export function ReviewHistory({ log }: { log: readonly LogEntry[] }) {
  if (log.length === 0) return null;
  const reviews = log.filter((e) => !isPlacing(e)).length;
  return (
    <details className="group rounded-xl border px-4 py-2 text-sm">
      <summary className="cursor-pointer py-1 font-medium select-none">
        History <span className="font-normal text-muted-foreground">· {reviews === 1 ? "1 review" : `${reviews} reviews`}</span>
      </summary>
      <ol className="max-h-56 divide-y overflow-y-auto">
        {[...log].reverse().map((e, i) => (
          <li key={i} className="flex justify-between gap-3 py-1.5">
            <span className="text-muted-foreground tabular-nums">{describeDay(e.day)}</span>
            <span className={cn(!isPlacing(e) && e.grade === 1 && "text-destructive")}>{describeEntry(e)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
