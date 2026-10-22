import { AlertCircleIcon, BookPlusIcon, BookXIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronsDownIcon, ListPlusIcon, Loader2Icon, MoveIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd, Progress } from "@/components/ui/primitives";
import { describeDay, type Day } from "@/core/dates";
import { ADAPTIVE_PHASE_NAMES, describePosition, PHASE_NAMES, type Phase, type Verse } from "@/core/schedule";
import { ALGORITHM_INFO, dueVerses, GRADE_NAMES, gradesFor, isAdaptive, preview, verseStatus, type Grade } from "@/core/srs";
import { PHASE_STYLE } from "@/lib/phase";
import { swipeHandlers } from "@/lib/swipe";
import { cn } from "@/lib/utils";
import { back, currentVerse, gradedAt, hasMore, next, resetDay, reveal, showAll, showNext, startReview, step, useReview } from "@/state/review";
import { deckOf, deckScheduler } from "@/core/decks";
import { useApp, useScheduler, useSchedulers, useTranslation } from "@/state/store";
import { prefetch, usePassageText } from "@/state/text";
import { openPanel } from "@/state/ui";

/** Today's review, one card at a time: the topic and reference, then the verse on Continue */
export function ReviewView({ day }: { day: Day }) {
  const verses = useApp((s) => s.verses);
  const review = useReview();
  const translation = useTranslation();
  const verse = currentVerse(verses, review);

  // A new day (or the first visit) starts that day's review
  useEffect(() => {
    if (useReview.getState().day !== day) startReview(day);
  }, [day]);

  // The books of every card ahead, so each opens at once, and offline later
  useEffect(() => {
    const all = useApp.getState().verses;
    prefetch(review.queue.map((id) => all.find((v) => v.id === id)?.ref ?? ""), translation);
  }, [review.queue, translation]);

  useReviewKeys(verse, day);

  return (
    <>
      <DeckChips day={day} />
      {verse ? <Card key={verse.id} verse={verse} day={day} /> : <Done day={day} />}
    </>
  );
}

/** With more than one deck: which to review (each with what's due in it), or all of them */
function DeckChips({ day }: { day: Day }) {
  const decks = useApp((s) => s.decks);
  const verses = useApp((s) => s.verses);
  const chosen = useApp((s) => s.settings.reviewDeck);
  const schedulerFor = useSchedulers();
  const due = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of dueVerses(verses, day, schedulerFor)) counts.set(deckOf(v), (counts.get(deckOf(v)) ?? 0) + 1);
    return counts;
  }, [verses, day, schedulerFor]);
  if (decks.length < 2) return null;
  const choose = (deck: string | null) => {
    useApp.getState().updateSettings({ reviewDeck: deck });
    startReview(day);
  };
  const total = [...due.values()].reduce((a, b) => a + b, 0);
  const chip = (id: string | null, name: string, n: number) => (
    <button
      key={id ?? "all"}
      onClick={() => choose(id)}
      aria-pressed={chosen === id}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors sm:h-8",
        chosen === id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {name}
      <span className={cn("text-xs tabular-nums", chosen === id ? "text-primary-foreground/80" : "text-muted-foreground")}>{n}</span>
    </button>
  );
  return (
    <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-thin" data-no-swipe>
      {chip(null, "All decks", total)}
      {decks.map((d) => chip(d.id, d.name, due.get(d.id) ?? 0))}
    </div>
  );
}

/**
 * Space or Enter (or →) continues, shows the next verse (verse by verse), and goes on (Good); 1–4
 * grade, in the buttons' order; ← goes back; M moves
 */
function useReviewKeys(verse: Verse | null, day: Day) {
  const schedulerFor = useSchedulers();
  const algorithm = verse ? schedulerFor(verse).algorithm : "fixed";
  useEffect(() => {
    const grades = gradesFor(algorithm);
    const onKey = (e: KeyboardEvent) => {
      if (!verse || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, [role=dialog]")) return;
      const { revealed } = useReview.getState();
      const graded = isAdaptive(algorithm) && /^[1-4]$/.test(e.key) ? grades[Number(e.key) - 1] : undefined;
      if (graded !== undefined && revealed) {
        e.preventDefault();
        next(day, graded);
      } else if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        step(day);
      } else if (e.key === "ArrowLeft") {
        back();
      } else if (e.key.toLowerCase() === "m") {
        openPanel({ kind: "move", verseId: verse.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verse, day, algorithm]);
}

function Card({ verse, day }: { verse: Verse; day: Day }) {
  const sch = useSchedulers()(verse);
  const passage = useApp((s) => (verse.passage ? s.passages.find((p) => p.id === verse.passage) : undefined));
  const { index, queue, revealed } = useReview();
  const more = useReview(hasMore);
  // The topic and reference where they'll be once the verse shows, so nothing moves on revealing
  const steady = useApp((s) => s.settings.steadyCard);
  const top = revealed || steady;
  const prompt = useApp((s) => s.settings.showPrompt);
  const s = verseStatus(verse, day, sch);
  const edit = () => openPanel({ kind: "edit", verseId: verse.id });
  const swipe = useMemo(
    () =>
      swipeHandlers((direction) => {
        if (direction === "right") return back();
        step(day);
      }),
    [day],
  );

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Where it is in today's review, its phase in the middle, where it is in that phase */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="-ml-2 size-10" disabled={index === 0} onClick={back} aria-label="Previous verse">
            <ChevronLeftIcon className="size-5" />
          </Button>
          <span className="tabular-nums">
            {index + 1} of {queue.length}
          </span>
        </div>
        <PhasePill phase={s.phase} adaptive={isAdaptive(sch.algorithm)} />
        {/* Where it is in its schedule, tapped to move it */}
        <button
          className="-mr-2 inline-flex items-center gap-1.5 justify-self-end rounded-md px-2 py-2 tabular-nums transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => openPanel({ kind: "move", verseId: verse.id })}
          title={isAdaptive(sch.algorithm) ? "Reschedule (M)" : "Move (M)"}
        >
          {describePosition(s)}
          <MoveIcon className="size-3.5" />
        </button>
      </div>
      <Progress value={index / queue.length} />

      <div
        {...swipe}
        role={revealed && !more ? undefined : "button"}
        tabIndex={revealed && !more ? undefined : -1}
        aria-label={!revealed ? "Show the verse" : more ? "Show the next verse" : undefined}
        onClick={!revealed ? reveal : more ? showNext : undefined}
        className={cn(
          "flex min-h-[min(22rem,55dvh)] flex-1 animate-fade-up flex-col rounded-2xl border bg-card shadow-sm select-none",
          (!revealed || more) && "cursor-pointer transition-transform active:scale-[0.995]",
          !top && "items-center justify-center text-center",
        )}
      >
        {/* The topic and reference stay put while a long passage scrolls below them */}
        <div data-card-head className={cn("px-5 sm:px-8", top ? "sticky top-[calc(var(--header-h)+env(safe-area-inset-top))] z-10 rounded-t-2xl border-b bg-card/95 py-4 backdrop-blur" : "py-8")}>
          {/* Each tapped opens it to edit: the passage, or the verse */}
          {passage && (
            <div className="mb-1">
              <Tappable onTap={() => openPanel({ kind: "passage", passageId: passage.id })} label={`Open ${passage.ref}`} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {passage.ref}
              </Tappable>
            </div>
          )}
          {(verse.tag || !passage) && (
            <div>
              <Tappable onTap={edit} label={`Edit ${verse.ref}`} className={cn("font-semibold break-words text-primary", top ? "text-xl" : "text-2xl sm:text-3xl")}>
                #{verse.tag || "?"}
              </Tappable>
            </div>
          )}
          <div className={top ? undefined : "mt-2"}>
            <Tappable onTap={edit} label={`Edit ${verse.ref}`} className={cn("font-serif font-semibold tracking-tight", top ? "text-2xl" : "text-3xl sm:text-4xl")}>
              {verse.ref}
            </Tappable>
          </div>
        </div>
        {revealed ? (
          <VerseText reference={verse.ref} />
        ) : !prompt ? null : (
          <p className={cn("text-sm text-balance text-muted-foreground", top ? "px-5 py-5 sm:px-8 sm:py-6" : "max-w-xs px-6 pb-8")}>
            {passage && !verse.tag ? "Say the reference and recite it aloud, then tap to check." : "Say the topic, the reference, and the verse aloud, then tap to check."}
          </p>
        )}
      </div>

      {/* In reach of a thumb: above the tab bar on a phone */}
      <div data-card-actions className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-gradient-to-t from-background from-70% to-transparent px-4 pt-4 pb-2 md:bottom-0 md:pb-4">
        {more ? (
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button variant="outline" size="lg" className="h-14 px-5 text-base" onClick={showAll}>
              <ChevronsDownIcon /> Show all
            </Button>
            <Button size="lg" className="h-14 text-base" onClick={showNext}>
              Next verse <Kbd className="ml-1 hidden border-white/20 bg-white/15 text-primary-foreground md:inline-flex">Space</Kbd>
            </Button>
          </div>
        ) : revealed && isAdaptive(sch.algorithm) ? (
          <GradeButtons verse={verse} day={day} />
        ) : revealed ? (
          <Button size="lg" className="h-14 w-full text-base" onClick={() => step(day)}>
            Next <Kbd className="ml-1 hidden border-white/20 bg-white/15 text-primary-foreground md:inline-flex">Space</Kbd>
          </Button>
        ) : (
          <Button size="lg" className="h-14 w-full text-base" onClick={reveal}>
            Continue <Kbd className="ml-1 hidden border-white/20 bg-white/15 text-primary-foreground md:inline-flex">Space</Kbd>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Text on the card that opens something when tapped, without the tap reaching the card (which shows the verse) */
function Tappable({ onTap, label, className, children }: { onTap: () => void; label: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      className={cn("-mx-1 max-w-full rounded-md px-1 [text-align:inherit] decoration-current/30 decoration-dashed underline-offset-4 transition-colors hover:underline", className)}
    >
      {children}
    </button>
  );
}

const GRADE_STYLE: Record<Grade, string> = {
  1: "text-destructive",
  2: "text-warning",
  3: "",
  4: "text-success",
};

/**
 * How well the verse came back, each grade with when it'd be seen next (`<10m`: again in this
 * sitting)
 */
function GradeButtons({ verse, day }: { verse: Verse; day: Day }) {
  const sch = useSchedulers()(verse);
  const at = useReview(gradedAt);
  const options = preview(verse, day, sch, at);
  return (
    <div className={cn("grid gap-2", options.length === 4 ? "grid-cols-4" : "grid-cols-2")}>
      {options.map((o, i) => (
        <Button
          key={o.grade}
          variant={o.grade === 3 ? "default" : "outline"}
          className="h-14 flex-col gap-0 px-1 text-base leading-tight"
          onClick={() => next(day, o.grade)}
          title={`${GRADE_NAMES[o.grade]} (${i + 1})`}
        >
          <span className={cn("font-semibold", o.grade !== 3 && GRADE_STYLE[o.grade])}>{GRADE_NAMES[o.grade]}</span>
          <span className={cn("text-xs font-normal tabular-nums", o.grade === 3 ? "text-primary-foreground/80" : "text-muted-foreground")}>{o.label}</span>
        </Button>
      ))}
    </div>
  );
}

export function PhasePill({ phase, adaptive = false, className }: { phase: Phase; adaptive?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", PHASE_STYLE[phase].soft, className)}>
      <span className={cn("size-1.5 rounded-full", PHASE_STYLE[phase].dot)} />
      {(adaptive ? ADAPTIVE_PHASE_NAMES : PHASE_NAMES)[phase]}
    </span>
  );
}

/** The verse's text in the chosen translation (verse by verse, as many of its verses as show) */
function VerseText({ reference }: { reference: string }) {
  const translation = useTranslation();
  const scale = useApp((s) => s.settings.textScale);
  const [state, retry] = usePassageText(reference, translation);
  const shown = useReview((r) => r.shown);
  const length = state.status === "ready" ? state.passages.reduce((n, p) => n + p.verses.length, 0) : null;
  // How many verses there are to show, for the keys and buttons that show the next
  useEffect(() => {
    useReview.setState({ length });
    return () => useReview.setState({ length: null });
  }, [length]);
  // Each verse shown in turn comes into view
  const newest = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (shown > 1 && Number.isFinite(shown)) bringIntoView(newest.current);
  }, [shown]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading the {translation.abbreviation}…
      </div>
    );
  }
  if (state.status !== "ready") {
    const message =
      state.status === "unknown"
        ? "This reference couldn't be read. Check its spelling in Verses."
        : state.status === "missing"
          ? `The ${translation.abbreviation} doesn't have this passage${translation.source.kind === "upload" ? " (its book wasn't uploaded)" : ""}.`
          : `Couldn't load the ${translation.abbreviation}: ${state.error}`;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
        {state.status === "error" ? <AlertCircleIcon className="size-6 text-destructive" /> : <BookXIcon className="size-6" />}
        <p className="max-w-sm">{message}</p>
        {state.status === "error" && (
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCwIcon /> Try again
          </Button>
        )}
      </div>
    );
  }
  const several = state.passages.length > 1;
  // Where each passage's verses begin among all the card's, to show only the first `shown`
  const offsets = state.passages.map((_, i) => state.passages.slice(0, i).reduce((n, p) => n + p.verses.length, 0));
  const left = length! - Math.min(shown, length!);
  return (
    <div className="space-y-5 px-5 py-5 sm:px-8 sm:py-6" style={{ fontSize: `${scale}em` }}>
      {state.passages.map((p, n) =>
        offsets[n]! >= shown ? null : (
          <div key={p.reference} className="select-text">
            {several && <div className="mb-1 text-[0.7em] font-semibold tracking-wide text-muted-foreground uppercase">{p.reference}</div>}
            <p className="font-serif text-[1.3rem] leading-[1.7] text-pretty sm:text-[1.45rem]">
              {p.verses.slice(0, shown - offsets[n]!).map((v, i) => (
                <span key={i} ref={offsets[n]! + i === shown - 1 ? newest : undefined} className={cn(left > 0 && "animate-fade-up")}>
                  {v.label && <sup className="mr-0.5 font-sans text-[0.55em] font-semibold text-muted-foreground">{v.label}</sup>}
                  {v.text}{" "}
                </span>
              ))}
            </p>
          </div>
        ),
      )}
      {left > 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
          Tap for the next verse · {left} more
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{translation.abbreviation}</p>
      )}
    </div>
  );
}

/**
 * Scrolls a verse just shown into the space between the card's topic and reference and its
 * buttons: its bottom just above the buttons, or, too tall to fit (or above that space), its top
 * just below the reference. Already in view, it stays where it is.
 */
function bringIntoView(el: HTMLElement | null) {
  const head = document.querySelector<HTMLElement>("[data-card-head]");
  if (!el || !head) return;
  // The topic and reference stick only once the page scrolls, so a verse is aimed at where they'll stick
  const now = head.getBoundingClientRect().bottom;
  const stuck = parseFloat(getComputedStyle(head).top) + head.offsetHeight;
  const top = Number.isNaN(stuck) ? now : stuck;
  const bottom = document.querySelector("[data-card-actions]")?.getBoundingClientRect().top ?? window.innerHeight;
  const gap = 16;
  const r = el.getBoundingClientRect();
  const by = r.height > bottom - top - 2 * gap || r.top < now + gap ? r.top - top - gap : r.bottom > bottom - gap ? r.bottom - bottom + gap : 0;
  if (Math.abs(by) >= 1) window.scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function Done({ day }: { day: Day }) {
  const all = useApp((s) => s.verses);
  const decks = useApp((s) => s.decks);
  // The deck chosen, if it's still there
  const chosen = useApp((s) => (s.decks.some((d) => d.id === s.settings.reviewDeck) ? s.settings.reviewDeck : null));
  const verses = chosen === null ? all : all.filter((v) => deckOf(v) === chosen);
  const sch = deckScheduler(useScheduler(), decks, chosen ?? undefined);
  const schedulerFor = useSchedulers();
  const names = isAdaptive(sch.algorithm) ? ADAPTIVE_PHASE_NAMES : PHASE_NAMES;
  const reviewed = useReview((s) => s.reviewed);

  if (verses.length === 0) {
    return (
      <div className="flex flex-1 animate-fade-up flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <BookPlusIcon className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-semibold">No verses yet</h2>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">
            Add the verses you've memorized, one at a time or a whole list at once.{" "}
            {isAdaptive(sch.algorithm)
              ? `${ALGORITHM_INFO[sch.algorithm].name} schedules each from how well you recall it.`
              : "Each is reviewed daily for 7 weeks, weekly for 7 months, then monthly for 7 years."}
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" className="h-12" onClick={() => openPanel({ kind: "import" })}>
            <ListPlusIcon /> Import a list
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={() => openPanel({ kind: "edit", verseId: null })}>
            Add a verse
          </Button>
        </div>
      </div>
    );
  }

  const statuses = verses.map((v) => verseStatus(v, day, schedulerFor(v)));
  const upcoming = statuses.flatMap((s) => (s.next && s.next > day ? [s.next] : [])).sort()[0];
  const again = dueVerses(verses, day, schedulerFor);
  const doneToday = verses.filter((v) => v.last === day).length;
  return (
    <div className="flex flex-1 animate-fade-up flex-col items-center justify-center gap-5 px-2 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2Icon className="size-8" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-serif text-2xl font-semibold">{reviewed > 0 ? "Done for today" : "Nothing due today"}</h2>
        {reviewed > 0 && (
          <p className="text-sm text-muted-foreground">
            You reviewed {reviewed} {reviewed === 1 ? "verse" : "verses"}.
          </p>
        )}
      </div>
      <div className="grid w-full max-w-sm grid-cols-3 gap-2">
        {(["daily", "weekly", "monthly"] as const).map((phase) => (
          <div key={phase} className="rounded-xl border bg-card px-2 py-3">
            <div className={cn("text-2xl font-semibold tabular-nums", PHASE_STYLE[phase].text)}>{statuses.filter((s) => s.phase === phase).length}</div>
            <div className="text-xs text-muted-foreground">{names[phase]}</div>
          </div>
        ))}
      </div>
      {upcoming && <p className="text-sm text-muted-foreground">Next review: {describeDay(upcoming)}</p>}
      {again.length > 0 && (
        <Button size="lg" className="h-12" onClick={() => startReview(day)}>
          Review {again.length} more
        </Button>
      )}
      {doneToday > 0 && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => resetDay(day)}>
          <RotateCcwIcon /> Review today's {doneToday === 1 ? "verse" : `${doneToday} verses`} again
        </Button>
      )}
    </div>
  );
}
