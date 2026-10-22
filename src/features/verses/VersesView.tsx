import { ChevronDownIcon, ChevronUpIcon, CopyIcon, DownloadIcon, ListPlusIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, Share2Icon, XIcon } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { describeDay, type Day } from "@/core/dates";
import { queueStarts, type Queued } from "@/core/queue";
import { describePosition, PHASE_NAMES, PHASES, status } from "@/core/schedule";
import { canShare, copyList, downloadList, shareList } from "@/lib/exportList";
import { PHASE_STYLE } from "@/lib/phase";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/store";
import { openPanel } from "@/state/ui";

/** Every verse by where it is (daily, weekly, monthly, upcoming, retained); tap one to edit it */
export function VersesView({ day }: { day: Day }) {
  const verses = useApp((s) => s.verses);
  const queue = useApp((s) => s.queue);
  const durations = useApp((s) => s.settings.durations);
  const [filter, setFilter] = useState("");

  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (v: { tag: string; ref: string }) => words.every((w) => `#${v.tag} ${v.ref}`.toLowerCase().includes(w));
  const shown = verses.filter(matches).map((verse) => ({ verse, status: status(verse, day, durations) }));
  const queueShown = queue.filter(matches);
  const total = verses.length + queue.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[calc(var(--header-h)+env(safe-area-inset-top))] z-20 -mx-4 flex items-center gap-2 bg-background/90 px-4 py-2 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by topic or reference"
            enterKeyHint="search"
            className="pr-9 pl-9"
          />
          {filter && (
            <button className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground" onClick={() => setFilter("")} aria-label="Clear">
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <Button variant="outline" className="hidden h-9 sm:inline-flex" onClick={() => openPanel({ kind: "edit", verseId: null })}>
          <PlusIcon /> Add
        </Button>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button variant="outline" size="icon" className="size-11 sm:size-9" aria-label="Import and export">
              <MoreHorizontalIcon />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-56 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg animate-fade-up"
            >
              <MenuItem onSelect={() => openPanel({ kind: "import" })}>
                <ListPlusIcon /> Import a list
              </MenuItem>
              <MenuItem onSelect={copyList} disabled={total === 0}>
                <CopyIcon /> Copy all as a list
              </MenuItem>
              {canShare() && (
                <MenuItem onSelect={shareList} disabled={total === 0}>
                  <Share2Icon /> Share the list
                </MenuItem>
              )}
              <MenuItem onSelect={downloadList} disabled={total === 0}>
                <DownloadIcon /> Save as a file
              </MenuItem>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {shown.length === 0 && queueShown.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          {total === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <p>No verses yet: add one, or import a list.</p>
              <Button variant="outline" onClick={() => openPanel({ kind: "import" })}>
                <ListPlusIcon /> Import a list
              </Button>
            </div>
          ) : (
            "No verses match."
          )}
        </div>
      ) : (
        PHASES.map((phase) => {
          const group = shown.filter((v) => v.status.phase === phase).sort((a, b) => b.verse.start.localeCompare(a.verse.start));
          // The queue comes before the verses dated ahead, nearest first
          const queueSection = phase === "upcoming" && <QueueSection key="queue" shown={queueShown} day={day} filtered={words.length > 0} />;
          if (phase === "upcoming") group.reverse();
          if (group.length === 0) return queueSection || null;
          return [
            queueSection,
            <section key={phase} className="space-y-2">
              <h2 className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span className={cn("size-2 rounded-full", PHASE_STYLE[phase].dot)} />
                {PHASE_NAMES[phase]}
                <span className="rounded-full bg-muted px-1.5 py-px text-[11px] tabular-nums">{group.length}</span>
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {group.map(({ verse, status: s }) => (
                  <li key={verse.id}>
                    <button
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                      onClick={() => openPanel({ kind: "edit", verseId: verse.id })}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-primary">#{verse.tag || "?"}</div>
                        <div className="truncate font-serif text-base font-semibold">{verse.ref}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div className="tabular-nums">{s.phase === "upcoming" ? `Starts ${describeDay(verse.start)}` : describePosition(s)}</div>
                        {s.due && <div className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground">Due</div>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>,
          ];
        })
      )}

      {/* Add, where a thumb rests */}
      <Button
        size="icon"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg sm:hidden"
        onClick={() => openPanel({ kind: "edit", verseId: null })}
        aria-label="Add a verse"
      >
        <PlusIcon className="size-6" />
      </Button>
    </div>
  );
}

/** Verses waiting to be started, in order, each with the day it starts */
function QueueSection({ shown, day, filtered }: { shown: Queued[]; day: Day; filtered: boolean }) {
  const queue = useApp((s) => s.queue);
  const verses = useApp((s) => s.verses);
  const autoStart = useApp((s) => s.settings.autoStart);
  const reorder = useApp((s) => s.reorderQueued);
  const starts = queueStarts(queue.length, verses, day, autoStart);
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="size-2 rounded-full border-2 border-muted-foreground/60" />
        Queue
        <span className="rounded-full bg-muted px-1.5 py-px text-[11px] tabular-nums">{queue.length}</span>
        <button
          className="-my-1 ml-auto rounded-md px-2 py-1 text-xs font-medium tracking-normal text-primary normal-case hover:bg-accent"
          onClick={() => openPanel({ kind: "edit", verseId: null, queue: true })}
        >
          + Queue a verse
        </button>
      </h2>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
          {filtered ? "No queued verses match." : "Queue verses to start later, without entering them on the day: one starts each week."}
        </p>
      ) : (
        <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
          {shown.map((q) => {
            const index = queue.indexOf(q);
            const start = starts[index];
            return (
              <li key={q.id} className="flex items-center">
                <button
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                  onClick={() => openPanel({ kind: "edit", verseId: q.id })}
                >
                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-primary">#{q.tag || "?"}</div>
                    <div className="truncate font-serif text-base font-semibold">{q.ref}</div>
                  </div>
                  <div className="shrink-0 pr-1 text-right text-xs text-muted-foreground tabular-nums">{start ? (start === day ? "Today" : describeDay(start).replace(/, \d{4}$/, "")) : "By hand"}</div>
                </button>
                {!filtered && (
                  <div className="flex shrink-0 flex-col pr-1">
                    <button className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={index === 0} onClick={() => reorder(q.id, -1)} aria-label="Earlier">
                      <ChevronUpIcon className="size-4" />
                    </button>
                    <button
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      disabled={index === queue.length - 1}
                      onClick={() => reorder(q.id, 1)}
                      aria-label="Later"
                    >
                      <ChevronDownIcon className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function MenuItem({ className, ...props }: Menu.DropdownMenuItemProps) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted sm:py-1.5 sm:text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
