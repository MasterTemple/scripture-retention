import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { completeReference, readReference, type Passage } from "@/bible/topos";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/state/store";
import { verseText } from "@/state/text";

/**
 * A reference field offering completions as it's typed (a tap or Tab takes one), first the
 * reference as typed when it's whole already, and saying what it reads the reference as, with
 * the text of its last verse
 */
export function ReferenceInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const completions = useMemo(() => {
    if (cursor === null) return [];
    if (!/[\p{L}\d:]$/u.test(value.slice(0, cursor)) || /^[\p{L}\d]/u.test(value.slice(cursor))) return [];
    try {
      return completeReference(value, cursor, 6).filter((c) => c.text.trim() !== value.slice(c.start, c.end).trim());
    } catch {
      return [];
    }
  }, [value, cursor]);

  const read = useMemo(() => {
    try {
      return readReference(value);
    } catch {
      return [];
    }
  }, [value]);
  const count = read.reduce((n, p) => n + p.verses.length, 0);
  // What's typed, when it's a reference with numbers (not a book alone): offered first, so taking
  // the first suggestion keeps it rather than lengthening it ("1:1-2" to "1:1-20")
  const typed = read.length > 0 && /\d/.test(value) ? read.map((p) => p.reference).join("; ") : null;
  const suggestions = completions.length === 0 ? [] : [
    ...(typed ? [{ label: typed, text: typed, start: 0, end: value.length, whole: true }] : []),
    ...completions.filter((c) => !typed || value.slice(0, c.start) + c.text + value.slice(c.end) !== typed).map((c) => ({ ...c, whole: false })),
  ];

  const accept = (i: number) => {
    const c = suggestions[i];
    if (!c) return;
    if (c.whole) {
      onChange(c.text);
      setCursor(null);
      return;
    }
    const at = c.start + c.text.length;
    onChange(value.slice(0, c.start) + c.text + value.slice(c.end));
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
      setCursor(at);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && suggestions.length > 0 && !e.shiftKey) {
      e.preventDefault();
      accept(0);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        ref={ref}
        id={id}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="done"
        placeholder="Proverbs 4:23"
        className="h-12 font-serif text-lg sm:h-10 sm:text-base"
        onChange={(e) => {
          onChange(e.target.value);
          setCursor(e.target.selectionStart);
        }}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setCursor(null), 150)}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 ? (
        // A row to scroll sideways on a phone, rather than wrapping under the keyboard
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 scrollbar-thin" data-no-swipe>
          {suggestions.map((c, i) => (
            <button
              type="button"
              key={`${c.label}-${i}`}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors hover:border-primary/40 hover:bg-accent",
                i === 0 && "border-primary/30 bg-accent text-accent-foreground",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(i)}
            >
              {c.whole && <CheckIcon className="size-3.5" />}
              {c.label}
            </button>
          ))}
        </div>
      ) : value.trim() ? (
        read.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckIcon className="size-3.5 shrink-0 text-success" />
            {read.map((p) => p.reference).join("; ")} · {count} {count === 1 ? "verse" : "verses"}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            Not a reference this app can read, so its text won't show.
          </p>
        )
      ) : null}
      {read.length > 0 && <LastVerse passages={read} />}
    </div>
  );
}

/** The text of a reference's last verse, to see it's the one meant ("John 1:1-3" shows verse 3) */
function LastVerse({ passages }: { passages: Passage[] }) {
  const translation = useTranslation();
  const last = passages.at(-1)?.verses.at(-1);
  const key = last ? `${last.bookId}.${last.chapter}.${last.verse}` : "";
  const [shown, setShown] = useState<{ key: string; text: string | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    const [bookId, chapter, verse] = key.split(".").map(Number) as [number, number, number];
    let live = true;
    // A moment after typing stops, so each key doesn't fetch
    const timer = setTimeout(() => {
      verseText(translation, { bookId, chapter, verse }).then(
        (text) => live && setShown({ key, text }),
        () => live && setShown({ key, text: null }),
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, translation]);
  if (!last || !shown?.text) return null;
  return (
    <p className={cn("line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 font-serif text-[15px] leading-snug transition-opacity", shown.key !== key && "opacity-50")}>
      <span className="mr-1 font-sans text-xs font-semibold text-muted-foreground">v{last.verse}</span>
      {shown.text}
    </p>
  );
}
