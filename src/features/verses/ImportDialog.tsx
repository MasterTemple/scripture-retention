import { ClipboardPasteIcon, FileUpIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent } from "@/components/ui/overlays";
import { Label, Switch, Textarea } from "@/components/ui/primitives";
import type { Day } from "@/core/dates";
import { countByBucket, entryStart, parseList } from "@/core/lists";
import { PHASE_NAMES, PHASES } from "@/core/schedule";
import { PHASE_STYLE } from "@/lib/phase";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/store";
import { closePanel } from "@/state/ui";

const EXAMPLE = "Once a day:\n`#guard-your-heart` Proverbs 4:23\n\nOnce a week:\n`#assurance` 1 John 5:13 @week 3\n`#desire` Proverbs 6:25 @2026-01-04";

const normalize = (ref: string) => ref.toLowerCase().replace(/\s+/g, " ").replace(/^psalms\b/, "psalm").trim();

/** Adds many verses at once from a list (see `core/lists.ts`) */
export function ImportDialog({ day }: { day: Day }) {
  const verses = useApp((s) => s.verses);
  const durations = useApp((s) => s.settings.durations);
  const [text, setText] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const skipId = useId();

  const { kept, skipped, errors } = useMemo(() => {
    const { entries, errors } = parseList(text);
    const existing = new Set(verses.map((v) => normalize(v.ref)));
    const kept = skipExisting ? entries.filter((e) => !existing.has(normalize(e.ref))) : entries;
    return { kept, skipped: entries.length - kept.length, errors };
  }, [text, verses, skipExisting]);
  const counts = countByBucket(kept, day, durations);

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast.error("Couldn't read the clipboard: paste into the box instead");
    }
  };

  const doImport = () => {
    useApp.getState().addVerses(kept.map((e) => ({ tag: e.tag, ref: e.ref, start: entryStart(e, day, durations) })));
    toast.success(`Imported ${kept.length} ${kept.length === 1 ? "verse" : "verses"}`);
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
            <p>
              End a line with <code>@day 12</code>, <code>@week 3</code>, or <code>@month 5</code> to place it further in, or with the date its daily reviews
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
          placeholder={"Once a day:\n#before-my-eyes Psalm 101:3\n\nOnce a week:\n#guard-your-heart Proverbs 4:23"}
          className="min-h-44 resize-y font-mono text-sm leading-relaxed sm:text-[13px]"
        />

        <div className="space-y-1.5 text-sm" aria-live="polite">
          {kept.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{kept.length} verses:</span>
              {PHASES.filter((p) => counts[p] > 0).map((p) => (
                <span key={p} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PHASE_STYLE[p].soft)}>
                  {counts[p]} {PHASE_NAMES[p].toLowerCase()}
                </span>
              ))}
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
