import { Trash2Icon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { allBooks, chapterLength, readPassages } from "@/bible/topos";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Input, Label, Select } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { describeDay, type Day } from "@/core/dates";
import { DEFAULT_DECK, deckOf, deckScheduler } from "@/core/decks";
import { cardRefs, describeUnit, type CardUnit } from "@/core/passages";
import { describePosition, PHASES } from "@/core/schedule";
import { ALGORITHM_INFO, isAdaptive, verseStatus } from "@/core/srs";
import { Stepper } from "@/features/settings/rows";
import { cn } from "@/lib/utils";
import { useApp, useScheduler, useSchedulers } from "@/state/store";
import { closePanel, openPanel } from "@/state/ui";
import { PositionPicker, StartSummary } from "./PositionPicker";
import { ReferenceInput } from "./ReferenceInput";

/** Adds a book, chapters, or any passage as one entry (`passageId` null), or shows one */
export function PassageDialog({ passageId, deck, day }: { passageId: string | null; deck?: string; day: Day }) {
  return passageId ? <PassageView passageId={passageId} day={day} /> : <AddPassage deck={deck} day={day} />;
}

/** Many cards make for a long review each day: past this, adding asks to be sure */
const MANY = 200;

function AddPassage({ deck: given, day }: { deck?: string; day: Day }) {
  const decks = useApp((s) => s.decks);
  const [ref, setRef] = useState("");
  const [tag, setTag] = useState("");
  const [deck, setDeck] = useState(given ?? DEFAULT_DECK);
  const [unit, setUnit] = useState<CardUnit>("chapter");
  const [size, setSize] = useState(5);
  const [start, setStart] = useState<Day>(day);
  const [sure, setSure] = useState(false);
  const ids = { ref: useId(), tag: useId(), deck: useId() };
  const defaults = useScheduler();
  const sch = deckScheduler(defaults, decks, deck);

  const read = useMemo(() => {
    try {
      return readPassages(ref);
    } catch {
      return [];
    }
  }, [ref]);
  const cards = useMemo(() => cardRefs(read, unit, size, chapterLength), [read, unit, size]);
  const count = (u: CardUnit) => cardRefs(read, u, size, chapterLength).length;
  useEffect(() => setSure(false), [cards.length]);

  const add = () => {
    if (cards.length === 0) {
      toast.error("Name a book, chapters, or verses: 1 Peter, Romans 8-12, Psalm 119:1-16");
      return;
    }
    if (cards.length > MANY && !sure) {
      setSure(true);
      return;
    }
    const app = useApp.getState();
    const name = read.map((p) => p.reference).join("; ");
    const id = app.addPassage(
      { ref: name, tag: tag.trim().replace(/^#/, ""), deck, unit, ...(unit === "group" ? { size } : {}) },
      cards.map((c) => ({ ref: c, start })),
    );
    toast.success(`Added ${name}: ${cards.length} ${cards.length === 1 ? "card" : "cards"}`, { action: { label: "Undo", onClick: () => useApp.getState().removePassage(id) } });
    closePanel();
  };

  return (
    <DialogContent
      title="Add a passage"
      description="A book, chapters, or any passage you've memorized, added as one: each card is reviewed on its own schedule, and the whole is deleted as one."
      footer={
        <Button onClick={add} variant={sure ? "destructive" : "default"}>
          {sure ? `Add all ${cards.length} cards` : cards.length > 0 ? `Add ${cards.length} ${cards.length === 1 ? "card" : "cards"}` : "Add"}
        </Button>
      }
    >
      <form
        className="space-y-5 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={ids.ref}>Passage</Label>
          <ReferenceInput id={ids.ref} value={ref} onChange={setRef} autoFocus />
          <ChapterPicker onPick={setRef} />
        </div>

        <div className="space-y-2">
          <Label>Cards</Label>
          <Segmented<CardUnit>
            className="w-full"
            value={unit}
            onChange={setUnit}
            options={[
              { value: "verse", label: <>Verses{read.length > 0 && <span className="text-xs text-muted-foreground tabular-nums"> {count("verse")}</span>}</> },
              { value: "chapter", label: <>Chapters{read.length > 0 && <span className="text-xs text-muted-foreground tabular-nums"> {count("chapter")}</span>}</> },
              { value: "group", label: <>Groups{read.length > 0 && <span className="text-xs text-muted-foreground tabular-nums"> {count("group")}</span>}</> },
              { value: "whole", label: "One" },
            ]}
          />
          {unit === "group" && (
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm">Verses a card</span>
              <Stepper value={size} min={2} max={30} step={1} format={(n) => `${n}`} onChange={setSize} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {cards.length === 0
              ? `Each card is ${describeUnit(unit, size).replace(/^a card per /, "a ").replace(/^groups of/, "a group of")}.`
              : `${cards.length} ${cards.length === 1 ? "card" : "cards"}: ${cards.slice(0, 4).join(", ")}${cards.length > 4 ? ", …" : ""}`}
            {sure && <span className="mt-1 block font-medium text-destructive">That's {cards.length} cards, each reviewed on its own. Larger cards (chapters, or groups) make a shorter review.</span>}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.tag}>Topic</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-primary">#</span>
              <Input id={ids.tag} value={tag} onChange={(e) => setTag(e.target.value.replace(/\s/g, "-"))} placeholder="optional" className="pl-6 font-medium text-primary" autoCapitalize="none" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.deck}>Deck</Label>
            <Select id={ids.deck} value={deck} onChange={(e) => setDeck(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Where its cards are today</Label>
          <PositionPicker start={start} day={day} onChange={setStart} durations={sch.durations} />
          {!isAdaptive(sch.algorithm) && <StartSummary start={start} day={day} durations={sch.durations} />}
          {isAdaptive(sch.algorithm) && <p className="text-xs text-muted-foreground">Every card starts here, then follows {ALGORITHM_INFO[sch.algorithm].name} by how you grade it.</p>}
        </div>
        <button type="submit" hidden />
      </form>
    </DialogContent>
  );
}

/** A book and the chapters ticked, written as a reference: `1 Peter`, `Romans 8-12; Romans 14` */
function ChapterPicker({ onPick }: { onPick: (reference: string) => void }) {
  const books = allBooks();
  const [bookId, setBookId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const book = books.find((b) => b.id === bookId);
  const id = useId();

  const write = (b: (typeof books)[number], chapters: number[]) => {
    if (chapters.length === 0 || chapters.length === b.chapters) return onPick(b.name);
    const sorted = [...chapters].sort((x, y) => x - y);
    const runs: [number, number][] = [];
    for (const c of sorted) {
      const last = runs.at(-1);
      if (last && c === last[1] + 1) last[1] = c;
      else runs.push([c, c]);
    }
    onPick(runs.map(([a, z]) => `${b.name} ${a === z ? a : `${a}-${z}`}`).join("; "));
  };

  return (
    <div className="space-y-2 rounded-xl bg-muted/60 p-3">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Or pick</span>
        <Select
          id={id}
          className="flex-1"
          value={bookId ?? ""}
          onChange={(e) => {
            const b = books.find((x) => x.id === Number(e.target.value));
            setBookId(b ? b.id : null);
            setChosen([]);
            if (b) write(b, []);
          }}
        >
          <option value="">a book…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </label>
      {book && book.chapters > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{chosen.length === 0 ? "The whole book, or tick chapters:" : `${chosen.length} of ${book.chapters} chapters`}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => {
              const on = chosen.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? chosen.filter((x) => x !== c) : [...chosen, c];
                    setChosen(next);
                    write(book, next);
                  }}
                  className={cn("h-9 rounded-lg border text-sm tabular-nums transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** A passage: its cards (each opening to its schedule), its topic and deck, and deleting it whole */
function PassageView({ passageId, day }: { passageId: string; day: Day }) {
  const passage = useApp((s) => s.passages.find((p) => p.id === passageId));
  const verses = useApp((s) => s.verses);
  const cards = useMemo(() => verses.filter((v) => v.passage === passageId), [verses, passageId]);
  const decks = useApp((s) => s.decks);
  const schedulerFor = useSchedulers();
  const [tag, setTag] = useState(passage?.tag ?? "");
  const [deck, setDeck] = useState(passage ? deckOf(passage) : DEFAULT_DECK);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = { tag: useId(), deck: useId() };

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  if (!passage) return null;
  const statuses = cards.map((v) => ({ verse: v, status: verseStatus(v, day, schedulerFor(v)) }));
  statuses.sort((a, b) => PHASES.indexOf(a.status.phase) - PHASES.indexOf(b.status.phase) || 0);
  const due = statuses.filter((s) => s.status.due).length;

  const save = () => {
    useApp.getState().updatePassage(passage.id, { tag: tag.trim().replace(/^#/, ""), deck });
    toast.success("Saved");
    closePanel();
  };

  const remove = () => {
    if (!confirmDelete) return setConfirmDelete(true);
    const before = useApp.getState();
    const saved = { passages: before.passages, verses: before.verses };
    before.removePassage(passage.id);
    toast(`Deleted ${passage.ref}`, { action: { label: "Undo", onClick: () => useApp.setState(saved) } });
    closePanel();
  };

  return (
    <DialogContent
      title={passage.ref}
      description={`${cards.length} ${cards.length === 1 ? "card" : "cards"}, ${describeUnit(passage.unit, passage.size)}${due > 0 ? ` · ${due} due` : ""}. To split it differently, delete it and add it again.`}
      footer={
        <>
          <Button variant={confirmDelete ? "destructive" : "ghost"} className="mr-auto text-destructive data-[confirm=true]:text-white" data-confirm={confirmDelete} onClick={remove}>
            <Trash2Icon /> {confirmDelete ? `Delete all ${cards.length}` : "Delete"}
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.tag}>Topic</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-primary">#</span>
              <Input id={ids.tag} value={tag} onChange={(e) => setTag(e.target.value.replace(/\s/g, "-"))} placeholder="optional" className="pl-6 font-medium text-primary" autoCapitalize="none" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.deck}>Deck</Label>
            <Select id={ids.deck} value={deck} onChange={(e) => setDeck(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {statuses.map(({ verse, status: s }) => (
            <li key={verse.id}>
              <button
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                onClick={() => openPanel({ kind: "edit", verseId: verse.id })}
              >
                <span className="min-w-0 flex-1 truncate font-serif font-semibold">{verse.ref}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{s.phase === "upcoming" ? `Starts ${describeDay(verse.start)}` : describePosition(s)}</span>
                {s.due && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Due</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DialogContent>
  );
}
