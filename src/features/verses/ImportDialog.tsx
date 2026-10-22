import { ClipboardPasteIcon, FileUpIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent } from "@/components/ui/overlays";
import { Label, Switch, Textarea } from "@/components/ui/primitives";
import type { Day } from "@/core/dates";
import { chapterLength, readPassages } from "@/bible/topos";
import { DEFAULT_DECK } from "@/core/decks";
import { countByBucket, deckNamed, entryStart, parseList } from "@/core/lists";
import { cardRefs } from "@/core/passages";
import { PHASE_NAMES, PHASES } from "@/core/schedule";
import { PHASE_STYLE } from "@/lib/phase";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/store";
import { closePanel } from "@/state/ui";

const EXAMPLE = "Daily:\n`#guard-your-heart` Proverbs 4:23\n\nWeekly:\n`#assurance` 1 John 5:13 @week 3\n`#desire` Proverbs 6:25 @2026-01-04\n\nMonthly:\n`#called` Romans 8:28 @month 5\n\nQueue:\n`#renewed` Romans 12:1-2";
const PASSAGE_EXAMPLE = "Deck: 1 Peter\n1 Peter as chapters\n\nDeck: Psalms\nPsalm 119 as groups of 8 @week 2\nPsalm 23 as one card";

const normalize = (ref: string) => ref.toLowerCase().replace(/\s+/g, " ").replace(/^psalms\b/, "psalm").trim();

/** Adds many verses at once from a list (see `core/lists.ts`) */
export function ImportDialog({ day }: { day: Day }) {
  const verses = useApp((s) => s.verses);
  const queue = useApp((s) => s.queue);
  const passages = useApp((s) => s.passages);
  const durations = useApp((s) => s.settings.durations);
  const [text, setText] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const skipId = useId();

  const { kept, skipped, errors } = useMemo(() => {
    const { entries, errors } = parseList(text);
    const existing = new Set([...verses, ...queue, ...passages].map((v) => normalize(v.ref)));
    const kept = skipExisting ? entries.filter((e) => !existing.has(normalize(e.ref))) : entries;
    return { kept, skipped: entries.length - kept.length, errors };
  }, [text, verses, queue, passages, skipExisting]);
  const counts = countByBucket(kept, day, durations);
  const passageCount = kept.filter((e) => e.passage).length;

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast.error("Couldn't read the clipboard: paste into the box instead");
    }
  };

  const doImport = () => {
    const app = useApp.getState();
    // Decks named in the list that aren't here yet are added
    const deckFor = (name: string | undefined) => {
      const found = deckNamed(name, useApp.getState().decks);
      const id = found ?? app.addDeck(name!.trim());
      return id === DEFAULT_DECK ? {} : { deck: id };
    };
    app.addVerses(kept.filter((e) => !e.queued && !e.passage).map((e) => ({ tag: e.tag, ref: e.ref, start: entryStart(e, day, durations), ...deckFor(e.deck) })));
    app.queueVerses(kept.filter((e) => e.queued).map((e) => ({ tag: e.tag, ref: e.ref, ...deckFor(e.deck) })));
    let unread = 0;
    for (const e of kept.filter((e) => e.passage)) {
      const read = readPassages(e.ref);
      const cards = cardRefs(read, e.passage!.unit, e.passage!.size ?? 5, chapterLength);
      if (cards.length === 0) {
        unread++;
        continue;
      }
      const start = entryStart(e, day, durations);
      app.addPassage({ ref: read.map((p) => p.reference).join("; "), tag: e.tag, unit: e.passage!.unit, ...(e.passage!.size ? { size: e.passage!.size } : {}), ...deckFor(e.deck) }, cards.map((ref) => ({ ref, start })));
    }
    const added = kept.length - unread;
    toast.success(`Imported ${added} ${added === 1 ? "entry" : "entries"}${unread > 0 ? ` (${unread} passage${unread === 1 ? "" : "s"} couldn't be read)` : ""}`);
    closePanel();
  };

  return (
    <DialogContent
      title="Import verses"
      description="One verse a line, its topic first."
      onOpenAutoFocus={(e) => e.preventDefault()}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={kept.length === 0} onClick={doImport}>
            {kept.length > 0 ? `Import ${kept.length}` : "Import"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <details className="group rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium select-none">How to write the list</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>Headings put the verses below them in a bucket, starting today:</p>
            <pre className="overflow-x-auto rounded-lg bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">{EXAMPLE}</pre>
            <p>A book, chapters, or any passage can be added as one, its cards split as verses, chapters, groups of verses, or one card; a <code>Deck:</code> heading puts what's below it in that deck (added if it isn't there yet):</p>
            <pre className="overflow-x-auto rounded-lg bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">{PASSAGE_EXAMPLE}</pre>
            <p>
              Under a <code>Queue:</code> heading, verses wait to be started, one each week. End a line with <code>@day 12</code>, <code>@week 3</code>, or <code>@month 5</code> to place it further in, or with the date its daily reviews
              began. The topic and backticks are optional; <code>#?</code> is a verse without a topic yet. An exported list imports back the same.
            </p>
          </div>
        </details>

        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1 sm:h-9" onClick={paste}>
            <ClipboardPasteIcon /> Paste
          </Button>
          <Button variant="outline" className="h-11 flex-1 sm:h-9" onClick={() => file.current?.click()}>
            <FileUpIcon /> Open a file
          </Button>
          <input
            ref={file}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              e.target.value = "";
            }}
          />
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder={"Daily:\n#before-my-eyes Psalm 101:3\n\nWeekly:\n#guard-your-heart Proverbs 4:23\n\nMonthly:\n#called Romans 8:28"}
          className="min-h-44 resize-y font-mono text-sm leading-relaxed sm:text-[13px]"
        />

        <div className="space-y-1.5 text-sm" aria-live="polite">
          {kept.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{kept.length} {kept.length === 1 ? "entry" : "entries"}:</span>
              {PHASES.filter((p) => counts[p] > 0).map((p) => (
                <span key={p} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PHASE_STYLE[p].soft)}>
                  {counts[p]} {PHASE_NAMES[p].toLowerCase()}
                </span>
              ))}
              {counts.queued > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{counts.queued} queued</span>}
              {passageCount > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {passageCount} {passageCount === 1 ? "passage" : "passages"}
                </span>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">{text.trim() ? "No verses found yet" : "Nothing pasted yet"}</div>
          )}
          {skipped > 0 && <div className="text-muted-foreground">{skipped} already added</div>}
          {errors.map((e) => (
            <div key={e.line} className="text-destructive">
              Line {e.line}: {e.message}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={skipId} className="block cursor-pointer space-y-1">
            <span className="block">Skip verses already added</span>
            <span className="block text-xs font-normal text-muted-foreground">Leaves out lines whose reference you have</span>
          </Label>
          <Switch id={skipId} checked={skipExisting} onCheckedChange={setSkipExisting} />
        </div>
      </div>
    </DialogContent>
  );
}
