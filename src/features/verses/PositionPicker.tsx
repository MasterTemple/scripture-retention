import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { describeDay, type Day } from "@/core/dates";
import { boundaries, BUCKET_UNITS, BUCKETS, describePosition, phaseLength, PHASE_NAMES, startFor, status, type Bucket } from "@/core/schedule";
import { PHASE_STYLE } from "@/lib/phase";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/store";

/** A verse placed on `start`, for working out where it is */
const placed = (start: Day) => ({ id: "", tag: "", ref: "", start });

/**
 * Picks a bucket and how far into it (`Week 3 of 30`), and gives the start day that puts a verse
 * there today. A start that's upcoming or retained begins at day 1 of the daily reviews.
 */
export function PositionPicker({ start, day, onChange }: { start: Day; day: Day; onChange: (start: Day) => void }) {
  const durations = useApp((s) => s.settings.durations);
  const s = status(placed(start), day, durations);
  const inBucket = s.phase !== "upcoming" && s.phase !== "retained";
  const bucket: Bucket = s.phase === "upcoming" || s.phase === "retained" ? "daily" : s.phase;
  const position = inBucket ? s.position : 1;
  const max = (b: Bucket) => phaseLength(b, durations, startFor(b, 1, day, durations));
  // What's typed, while it's typed (it may be empty or too large for a moment)
  const [typed, setTyped] = useState<string | null>(null);

  const set = (b: Bucket, n: number) => onChange(startFor(b, Math.max(1, Math.min(max(b), n)), day, durations));

  return (
    <div className="space-y-3">
      <Segmented<Bucket>
        className="w-full"
        value={bucket}
        onChange={(b) => set(b, position)}
        options={BUCKETS.map((b) => ({
          value: b,
          label: (
            <>
              <span className={cn("size-1.5 rounded-full", PHASE_STYLE[b].dot)} /> {PHASE_NAMES[b]}
            </>
          ),
        }))}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-40"
          onClick={() => set(bucket, position - 1)}
          disabled={position <= 1}
          aria-label="Earlier"
        >
          <MinusIcon className="size-5" />
        </button>
        <label className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-muted/60 text-base">
          <span className="text-muted-foreground">{BUCKET_UNITS[bucket]}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max(bucket)}
            value={typed ?? position}
            onChange={(e) => {
              setTyped(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1) set(bucket, n);
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => setTyped(null)}
            className="w-14 rounded-md border border-input bg-card py-1 text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            aria-label={`${BUCKET_UNITS[bucket]} of the ${PHASE_NAMES[bucket].toLowerCase()} reviews`}
          />
          <span className="text-muted-foreground tabular-nums">of {max(bucket)}</span>
        </label>
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground shadow-xs transition-colors hover:bg-muted active:scale-95 disabled:opacity-40"
          onClick={() => set(bucket, position + 1)}
          disabled={position >= max(bucket)}
          aria-label="Later"
        >
          <PlusIcon className="size-5" />
        </button>
      </div>
      {/* A long phase (84 months) is quicker to cross by dragging */}
      <input
        type="range"
        min={1}
        max={max(bucket)}
        value={position}
        onChange={(e) => set(bucket, Number(e.target.value))}
        className="block h-6 w-full cursor-pointer accent-primary"
        data-no-swipe
        aria-label="How far in"
      />
    </div>
  );
}

/** What a start day means: where the verse is today, and when each phase begins */
export function StartSummary({ start, day }: { start: Day; day: Day }) {
  const durations = useApp((s) => s.settings.durations);
  const b = boundaries(start, durations);
  const s = status(placed(start), day, durations);
  const rows: [string, Day, keyof typeof PHASE_STYLE][] = [
    ["Daily from", b.daily, "daily"],
    ["Weekly from", b.weekly, "weekly"],
    ["Monthly from", b.monthly, "monthly"],
    ["Retained on", b.retained, "retained"],
  ];
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
      <div className="mb-2 font-medium">
        Today: {s.phase === "upcoming" ? `starts ${describeDay(start)}` : describePosition(s)}
        {s.due && <span className="ml-2 text-xs font-semibold text-primary">Due</span>}
      </div>
      <ol className="space-y-1">
        {rows.map(([label, date, phase]) => (
          <li key={phase} className={cn("flex items-center gap-2", s.phase === phase ? "font-medium text-foreground" : "text-muted-foreground")}>
            <span className={cn("size-2 shrink-0 rounded-full", PHASE_STYLE[phase].dot, s.phase !== phase && "opacity-50")} />
            <span className="w-28 shrink-0">{label}</span>
            <span className="tabular-nums">{describeDay(date)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
