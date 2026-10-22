import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { completeReference, readReference } from "@/bible/topos";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * A reference field offering completions as it's typed (a tap or Tab takes one), and saying
 * what it reads the reference as
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

  const accept = (i: number) => {
    const c = completions[i];
    if (!c) return;
    const at = c.start + c.text.length;
    onChange(value.slice(0, c.start) + c.text + value.slice(c.end));
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
      setCursor(at);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && completions.length > 0 && !e.shiftKey) {
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
      {completions.length > 0 ? (
        // A row to scroll sideways on a phone, rather than wrapping under the keyboard
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 scrollbar-thin" data-no-swipe>
          {completions.map((c, i) => (
            <button
              type="button"
              key={`${c.label}-${i}`}
              className={cn(
                "h-9 shrink-0 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors hover:border-primary/40 hover:bg-accent",
                i === 0 && "border-primary/30 bg-accent text-accent-foreground",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(i)}
            >
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
    </div>
  );
}
