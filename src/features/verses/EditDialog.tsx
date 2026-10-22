import { CalendarClockIcon, PlayIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Input, Label } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { daysBetween, describeDay, isDay, type Day } from "@/core/dates";
import { queueStarts } from "@/core/queue";
import { isAdaptive, verseStatus } from "@/core/srs";
import { useApp, useScheduler } from "@/state/store";
import { closePanel } from "@/state/ui";
import { AdaptiveSummary, IntervalPicker, ReviewHistory } from "./AdaptiveSchedule";
import { PositionPicker, StartSummary } from "./PositionPicker";
import { ReferenceInput } from "./ReferenceInput";

type Where = "schedule" | "queue";

/**
 * Adds a verse (`verseId` null) or edits one, started or queued: its topic, reference, and where
 * it is in the schedule, or that it waits in the queue
 */
export function EditDialog({ verseId, day, queue: queueFirst = false }: { verseId: string | null; day: Day; queue?: boolean }) {
  const verse = useApp((s) => (verseId ? s.verses.find((v) => v.id === verseId) : undefined));
  const queued = useApp((s) => (verseId ? s.queue.find((q) => q.id === verseId) : undefined));
  const existing = verse ?? queued;
  const [where, setWhere] = useState<Where>(queued || (!verse && queueFirst) ? "queue" : "schedule");
  const [tag, setTag] = useState(existing?.tag ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [start, setStart] = useState<Day>(verse?.start ?? day);
  const [date, setDate] = useState<string>(start);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = { tag: useId(), ref: useId(), date: useId() };
  const sch = useScheduler();
  const adaptive = isAdaptive(sch.algorithm);
  // A verse with reviews logged is placed by its history under an adaptive algorithm, not its start
  const tracked = adaptive && !!verse?.log?.length;
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [forget, setForget] = useState(false);

  useEffect(() => setDate(start), [start]);
  // A second tap deletes; the first only asks, and lapses
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const save = () => {
    if (!ref.trim()) {
      toast.error("A verse needs a reference");
      return;
    }
    const app = useApp.getState();
    const fields = { tag: tag.trim().replace(/^#/, ""), ref: ref.trim().replace(/\s+/g, " ") };
    if (where === "schedule") {
      if (verse) {
        app.updateVerse(verse.id, fields);
        if (tracked) {
          if (forget) app.placeVerse(verse.id, 0, day, false);
          else if (nextIn !== null) app.placeVerse(verse.id, nextIn, day, false);
        } else if (start !== verse.start) app.moveVerse(verse.id, start, day, false);
      } else if (queued) {
        app.updateQueued(queued.id, fields);
        app.startQueued(queued.id, start);
      } else app.addVerses([{ ...fields, start }]);
    } else {
      if (queued) app.updateQueued(queued.id, fields);
      else if (verse) {
        app.updateVerse(verse.id, fields);
        app.unstart(verse.id);
      } else app.queueVerses([fields]);
    }
    toast.success(existing ? "Saved" : where === "queue" ? `Queued ${fields.ref}` : `Added ${fields.ref}`);
    closePanel();
  };

  const remove = () => {
    if (!existing) return;
    if (!confirmDelete) return setConfirmDelete(true);
    const app = useApp.getState();
    if (verse) {
      app.removeVerse(verse.id);
      toast(`Deleted ${verse.ref}`, { action: { label: "Undo", onClick: () => useApp.setState((s) => ({ verses: [...s.verses, verse] })) } });
    } else if (queued) {
      const index = app.queue.indexOf(queued);
      app.removeQueued(queued.id);
      toast(`Deleted ${queued.ref}`, {
        action: { label: "Undo", onClick: () => useApp.setState((s) => ({ queue: [...s.queue.slice(0, index), queued, ...s.queue.slice(index)] })) },
      });
    }
    closePanel();
  };

  return (
    <DialogContent
      title={existing ? "Edit verse" : "Add a verse"}
      onOpenAutoFocus={(e) => existing && e.preventDefault()}
      footer={
        <>
          {existing && (
            <Button variant={confirmDelete ? "destructive" : "ghost"} className="mr-auto text-destructive data-[confirm=true]:text-white" data-confirm={confirmDelete} onClick={remove}>
              <Trash2Icon /> {confirmDelete ? "Tap to delete" : "Delete"}
            </Button>
          )}
          <Button onClick={save}>{existing ? "Save" : where === "queue" ? "Queue it" : "Add"}</Button>
        </>
      }
    >
      <form
        className="space-y-5 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={ids.ref}>Reference</Label>
          <ReferenceInput id={ids.ref} value={ref} onChange={setRef} autoFocus={!existing} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.tag}>Topic</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-primary">#</span>
            <Input
              id={ids.tag}
              value={tag}
              onChange={(e) => setTag(e.target.value.replace(/\s/g, "-"))}
              placeholder="guard-your-heart"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className="pl-6 font-medium text-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">A word or two to recall it by, said before the reference.</p>
        </div>

        <Segmented<Where>
          className="w-full"
          value={where}
          onChange={setWhere}
          options={[
            { value: "schedule", label: <><PlayIcon /> Start it</> },
            { value: "queue", label: <><CalendarClockIcon /> Queue it</> },
          ]}
        />
        {where === "queue" ? (
          <QueueNote id={queued?.id} day={day} />
        ) : tracked && verse ? (
          <>
            <AdaptiveSummary verse={verse} day={day} />
            {forget ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
                <span>Starts over as new when saved.</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setForget(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Label className="block space-y-1">
                  <span className="block">Reschedule</span>
                  <span className="block text-xs font-normal text-muted-foreground">Changed here, it comes back when you choose, and the algorithm goes on from there.</span>
                </Label>
                <IntervalPicker days={nextIn ?? untilNext(verse, day)} day={day} onChange={setNextIn} />
                <Button type="button" variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setForget(true)}>
                  <RotateCcwIcon /> Start over as new
                </Button>
              </div>
            )}
            <ReviewHistory log={verse.log ?? []} />
          </>
        ) : (
          <>
            <div className="space-y-3">
              <Label>Where it is today</Label>
              <PositionPicker start={start} day={day} onChange={setStart} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={ids.date} className="block space-y-1">
                <span className="block">Start date</span>
                <span className="block text-xs font-normal text-muted-foreground">The day its daily reviews began, or will</span>
              </Label>
              <Input
                id={ids.date}
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (isDay(e.target.value)) setStart(e.target.value);
                }}
                className="w-auto min-w-40"
              />
            </div>
            {adaptive ? <AdaptiveSummary verse={{ id: verse?.id ?? "", tag, ref, start, last: verse?.last }} day={day} /> : <StartSummary start={start} day={day} />}
            {verse?.log && <ReviewHistory log={verse.log} />}
          </>
        )}
        {verse?.last && <p className="text-xs text-muted-foreground">Last reviewed {describeDay(verse.last)}</p>}
        {/* Enter in a field saves */}
        <button type="submit" hidden />
      </form>
    </DialogContent>
  );
}

/** Days from `day` to a verse's next review */
function untilNext(verse: Parameters<typeof verseStatus>[0], day: Day) {
  const s = verseStatus(verse, day, useApp.getState().settings);
  return Math.max(1, s.next ? daysBetween(day, s.next) : (s.interval ?? 1));
}

/** When a queued verse (or one about to be) will start */
function QueueNote({ id, day }: { id?: string; day: Day }) {
  const queue = useApp((s) => s.queue);
  const verses = useApp((s) => s.verses);
  const autoStart = useApp((s) => s.settings.autoStart);
  const index = id ? queue.findIndex((q) => q.id === id) : queue.length;
  const starts = queueStarts(index + 1, verses, day, autoStart);
  const start = starts[index];
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
      {start ? (
        <p>
          <span className="font-medium">{start === day ? "Starts today" : `Starts ${describeDay(start)}`}</span>
          <span className="text-muted-foreground">
            {" "}
            · {index === 0 ? "first" : `${ordinal(index + 1)}`} in the queue, which starts a verse each week (change it in Settings).
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">It waits in the queue until you start it. Turn on starting queued verses each week in Settings.</p>
      )}
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
