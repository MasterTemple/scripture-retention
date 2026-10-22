import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Switch, Textarea } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import {
  ALGORITHM_IDS,
  ALGORITHM_INFO,
  DEFAULT_SRS,
  dueVerses,
  formatSteps,
  parseSteps,
  type AlgorithmId,
  type LadderOptions,
  type SrsOptions,
} from "@/core/srs";
import { FSRS6_DEFAULTS, fsrsVersion, parseParams } from "@/core/srs/fsrs";
import { cn } from "@/lib/utils";
import { reviewDay, useApp } from "@/state/store";
import { Row, Section, Stepper } from "./rows";

/** Each algorithm, with how many verses it has due today, to pick one */
export function AlgorithmSection() {
  const algorithm = useApp((s) => s.settings.algorithm);
  const verses = useApp((s) => s.verses);
  const durations = useApp((s) => s.settings.durations);
  const srs = useApp((s) => s.settings.srs);
  const update = useApp((s) => s.updateSettings);
  const due = useMemo(() => {
    const day = reviewDay();
    return Object.fromEntries(ALGORITHM_IDS.map((id) => [id, dueVerses(verses, day, { algorithm: id, durations, srs }).length])) as Record<AlgorithmId, number>;
  }, [verses, durations, srs]);

  return (
    <Section title="Algorithm" description="Switch at any time: every review is kept, and the one you pick works from all of them.">
      <div role="radiogroup" aria-label="Algorithm" className="space-y-1.5 py-3">
        {ALGORITHM_IDS.map((id) => {
          const info = ALGORITHM_INFO[id];
          const on = id === algorithm;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={on}
              onClick={() => update({ algorithm: id })}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                on ? "border-primary bg-accent/60" : "bg-card hover:bg-muted/60",
              )}
            >
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", on && "border-primary bg-primary text-primary-foreground")}>
                {on && <CheckIcon className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{info.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{due[id]} due today</span>
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{info.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/** One algorithm's options, and a way to change them a part at a time */
function useOptions<K extends keyof SrsOptions>(key: K): [SrsOptions[K], (patch: Partial<SrsOptions[K]>) => void] {
  const options = useApp((s) => s.settings.srs[key]);
  const set = (patch: Partial<SrsOptions[K]>) => {
    const { settings, updateSettings } = useApp.getState();
    updateSettings({ srs: { ...settings.srs, [key]: { ...settings.srs[key], ...patch } } });
  };
  return [options, set];
}

const percent = (n: number) => `${Math.round(n * 100)}%`;
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** The options of the algorithm picked (none for the fixed schedule, whose phases are their own section) */
export function AlgorithmOptions() {
  const algorithm = useApp((s) => s.settings.algorithm);
  switch (algorithm) {
    case "fixed":
      return null;
    case "fsrs":
      return (
        <>
          <FsrsSection />
          <StepsSection title="Steps and limits" description="Shared with Anki (SM-2), as Anki's deck options share them." />
        </>
      );
    case "anki":
      return (
        <>
          <StepsSection title="Steps and limits" />
          <AnkiSection />
        </>
      );
    case "sm2":
      return <Sm2Section />;
    case "leitner":
      return <LadderSection which="leitner" />;
    case "pimsleur":
      return <LadderSection which="pimsleur" />;
    case "ebisu":
      return <EbisuSection />;
  }
}

function FsrsSection() {
  const [fsrs, set] = useOptions("fsrs");
  const version = fsrsVersion(fsrs.params);
  return (
    <Section title="FSRS">
      <Row title="Desired retention" description="How likely you are to recall a verse when it's due. Higher means more reviews.">
        <Stepper value={fsrs.desiredRetention} min={0.7} max={0.99} step={0.01} format={percent} onChange={(n) => set({ desiredRetention: round(n) })} />
      </Row>
      <TextOption
        title="Parameters"
        description={
          <>
            {fsrs.params.length === 0 ? "FSRS-6's defaults." : `FSRS-${version}, ${fsrs.params.length} parameters.`} Paste the ones Anki's optimizer found for you (17, 19, or 21 numbers), or leave empty
            for the defaults.
          </>
        }
        value={fsrs.params.join(", ")}
        placeholder={FSRS6_DEFAULTS.join(", ")}
        parse={parseParams}
        error="FSRS takes 17 (FSRS-4.5), 19 (FSRS-5), or 21 (FSRS-6) numbers"
        onCommit={(params) => set({ params })}
        multiline
      />
    </Section>
  );
}

function StepsSection({ title, description }: { title: string; description?: string }) {
  const [anki, set] = useOptions("anki");
  const fuzzId = useId();
  return (
    <Section title={title} description={description}>
      <TextOption
        title="Learning steps"
        description="A new verse's first reviews. Under a day, it's shown again later in the same sitting."
        value={formatSteps(anki.learningSteps)}
        placeholder="1m 10m"
        parse={parseSteps}
        error="Lengths of time, as 1m 10m 1d"
        onCommit={(learningSteps) => set({ learningSteps })}
      />
      <TextOption
        title="Relearning steps"
        description="A forgotten verse's reviews before it goes back to its interval."
        value={formatSteps(anki.relearningSteps)}
        placeholder="10m"
        parse={parseSteps}
        error="Lengths of time, as 10m or 1d"
        onCommit={(relearningSteps) => set({ relearningSteps })}
      />
      <Row title="Maximum interval" description="The longest a verse goes between reviews.">
        <NumberOption value={anki.maximumInterval} min={1} max={36500} unit="days" onChange={(maximumInterval) => set({ maximumInterval })} />
      </Row>
      <Row title="Fuzz" description="Spreads verses due the same day over a few days nearby, as Anki does." htmlFor={fuzzId}>
        <Switch id={fuzzId} checked={anki.fuzz} onCheckedChange={(fuzz) => set({ fuzz })} />
      </Row>
      <Row title="Leech threshold" description="Forgotten this often, a verse is marked a leech. 0 turns it off.">
        <Stepper value={anki.leechThreshold} min={0} max={99} step={1} format={(n) => (n === 0 ? "Off" : `${n}`)} onChange={(leechThreshold) => set({ leechThreshold })} />
      </Row>
    </Section>
  );
}

function AnkiSection() {
  const [anki, set] = useOptions("anki");
  return (
    <Section title="Intervals and ease">
      <Row title="Graduating interval" description="After the last learning step.">
        <Stepper value={anki.graduatingInterval} min={1} max={365} step={1} width="w-20" format={days} onChange={(graduatingInterval) => set({ graduatingInterval })} />
      </Row>
      <Row title="Easy interval" description="Easy on a new verse.">
        <Stepper value={anki.easyInterval} min={1} max={365} step={1} width="w-20" format={days} onChange={(easyInterval) => set({ easyInterval })} />
      </Row>
      <Row title="Starting ease" description="How fast a new verse's intervals grow.">
        <Stepper value={anki.startingEase} min={1.3} max={5} step={0.05} format={percent} onChange={(n) => set({ startingEase: round(n) })} />
      </Row>
      <Row title="Easy bonus" description="How much longer Easy makes an interval than Good.">
        <Stepper value={anki.easyBonus} min={1} max={5} step={0.05} format={percent} onChange={(n) => set({ easyBonus: round(n) })} />
      </Row>
      <Row title="Hard interval" description="Hard's interval, against the last.">
        <Stepper value={anki.hardInterval} min={0.5} max={2} step={0.05} format={percent} onChange={(n) => set({ hardInterval: round(n) })} />
      </Row>
      <Row title="Interval modifier" description="Every interval, longer or shorter.">
        <Stepper value={anki.intervalModifier} min={0.5} max={2} step={0.05} format={percent} onChange={(n) => set({ intervalModifier: round(n) })} />
      </Row>
      <Row title="New interval" description="The share of its interval a forgotten verse keeps.">
        <Stepper value={anki.newInterval} min={0} max={1} step={0.05} format={percent} onChange={(n) => set({ newInterval: round(n) })} />
      </Row>
      <Row title="Minimum interval" description="After a verse is forgotten.">
        <Stepper value={anki.minimumInterval} min={1} max={365} step={1} width="w-20" format={days} onChange={(minimumInterval) => set({ minimumInterval })} />
      </Row>
      <ResetRow which="anki" />
    </Section>
  );
}

function Sm2Section() {
  const [sm2, set] = useOptions("sm2");
  return (
    <Section title="SuperMemo SM-2" description="Again, Hard, Good, and Easy are SM-2's qualities 2, 3, 4, and 5.">
      <Row title="Starting E-Factor" description="SM-2 starts every item at 2.5.">
        <Stepper value={sm2.startingEase} min={1.3} max={5} step={0.1} format={(n) => n.toFixed(1)} onChange={(n) => set({ startingEase: round(n, 1) })} />
      </Row>
    </Section>
  );
}

function LadderSection({ which }: { which: "leitner" | "pimsleur" }) {
  const [ladder, set] = useOptions(which);
  return (
    <Section title={which === "leitner" ? "Boxes" : "Intervals"}>
      <TextOption
        title={which === "leitner" ? "Each box's interval" : "Each interval"}
        description="In days, from the first. Recalled, a verse moves to the next."
        value={ladder.intervals.join(" ")}
        placeholder={DEFAULT_SRS[which].intervals.join(" ")}
        parse={parseDays}
        error="Whole numbers of days, as 1 2 4 8"
        onCommit={(intervals) => set({ intervals })}
      />
      <Row title="Forgotten" description="Where a verse goes when it's forgotten.">
        <Segmented<LadderOptions["onMiss"]>
          size="sm"
          value={ladder.onMiss}
          onChange={(onMiss) => set({ onMiss })}
          options={[
            { value: "first", label: "First" },
            { value: "back", label: "Back one" },
          ]}
        />
      </Row>
    </Section>
  );
}

function EbisuSection() {
  const [ebisu, set] = useOptions("ebisu");
  return (
    <Section title="Ebisu">
      <Row title="Target recall" description="A verse comes due when the chance you'd recall it falls to this.">
        <Stepper value={ebisu.targetRecall} min={0.5} max={0.99} step={0.01} format={percent} onChange={(n) => set({ targetRecall: round(n) })} />
      </Row>
      <Row title="Starting half-life" description="When a new verse is as likely forgotten as recalled.">
        <Stepper value={ebisu.halflife} min={0.5} max={30} step={0.5} width="w-20" format={(n) => `${n} ${n === 1 ? "day" : "days"}`} onChange={(halflife) => set({ halflife })} />
      </Row>
      <Row title="Prior strength" description="Ebisu's α = β: higher trusts the starting half-life more.">
        <Stepper value={ebisu.ab} min={1.5} max={10} step={0.5} format={(n) => n.toFixed(1)} onChange={(ab) => set({ ab })} />
      </Row>
    </Section>
  );
}

function ResetRow({ which }: { which: keyof SrsOptions }) {
  const [, set] = useOptions(which);
  return (
    <div className="py-3">
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => set(DEFAULT_SRS[which])}>
        <RotateCcwIcon /> Reset to Anki's defaults
      </Button>
    </div>
  );
}

const parseDays = (text: string): number[] | null => {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const out = parts.map(Number);
  return out.length > 0 && out.every((n) => Number.isInteger(n) && n >= 1) ? out : null;
};

/** A typed option, saved when it reads right (on leaving the field), with what's wrong when it doesn't */
function TextOption<T>({
  title,
  description,
  value,
  placeholder,
  parse,
  error,
  onCommit,
  multiline = false,
}: {
  title: string;
  description: ReactNode;
  value: string;
  placeholder: string;
  parse: (text: string) => T | null;
  error: string;
  onCommit: (value: T) => void;
  multiline?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  const wrong = text !== null && parse(text) === null;
  const commit = () => {
    if (text === null) return;
    const parsed = parse(text);
    if (parsed !== null) {
      onCommit(parsed);
      setText(null);
    }
  };
  const Field = multiline ? Textarea : Input;
  return (
    <div className="space-y-2 py-3">
      <label htmlFor={id} className="block space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{description}</span>
      </label>
      <Field
        id={id}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) commit();
        }}
        spellCheck={false}
        autoCapitalize="none"
        className={cn("font-mono text-sm", multiline && "min-h-20", wrong && "border-destructive")}
        aria-invalid={wrong}
      />
      {wrong && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function NumberOption({ value, min, max, unit, onChange }: { value: number; min: number; max: number; unit: string; onChange: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2 text-sm">
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text ?? value}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setText(null)}
        className="w-24 text-right tabular-nums"
      />
      <span className="text-muted-foreground">{unit}</span>
    </label>
  );
}
