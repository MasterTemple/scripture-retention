import { BookOpenCheckIcon, LibraryIcon, SettingsIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlays";
import { dueVerses } from "@/core/schedule";
import { ReviewView } from "@/features/review/ReviewView";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { TranslationDialog } from "@/features/settings/TranslationDialog";
import { EditDialog } from "@/features/verses/EditDialog";
import { ImportDialog } from "@/features/verses/ImportDialog";
import { MoveDialog } from "@/features/verses/MoveDialog";
import { VersesView } from "@/features/verses/VersesView";
import { applyAccent } from "@/lib/color";
import { cn } from "@/lib/utils";
import { startReview } from "@/state/review";
import { startDueQueued, useApp, useReviewDay } from "@/state/store";
import { closePanel, openPanel, showView, useUi, type View } from "@/state/ui";

function useTheme() {
  const theme = useApp((s) => s.settings.theme);
  const accent = useApp((s) => s.settings.accent);
  useEffect(() => applyAccent(accent), [accent]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = dark ? "#111114" : "#f7f5f1";
      document.head.append(meta);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <g transform="translate(6 6) scale(0.8333)" className="stroke-primary-foreground" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M12 21V7" />
          <path d="m16 12 2 2 4-4" />
          <path d="M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3" />
        </g>
      </svg>
      <span className="font-serif text-lg font-semibold tracking-tight">Scripture Retention</span>
    </div>
  );
}

function useDueCount(day: string) {
  const verses = useApp((s) => s.verses);
  const durations = useApp((s) => s.settings.durations);
  return dueVerses(verses, day, durations).length;
}

export default function App() {
  useTheme();
  const day = useReviewDay();
  const view = useUi((s) => s.view);
  const due = useDueCount(day);
  const count = useApp((s) => s.verses.length + s.queue.length);

  // Queued verses whose day has come start (on opening the app, a new day, or a change to the queue)
  const queue = useApp((s) => s.queue);
  const autoStart = useApp((s) => s.settings.autoStart);
  useEffect(() => {
    const started = startDueQueued(day);
    if (started.length === 1) toast.success(`Started ${started[0]!.ref} from your queue`);
    else if (started.length > 1) toast.success(`Started ${started.length} verses from your queue`);
  }, [day, queue, autoStart]);

  const go = (v: View) => {
    // Coming back to the review takes up what's due now, keeping the card in front
    if (v === "review") startReview(day, true);
    showView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/85 pt-safe backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 sm:px-8">
            <Logo />
            <nav className="ml-auto hidden items-center gap-1 md:flex">
              <HeaderTab active={view === "review"} onClick={() => go("review")} badge={due}>
                Review
              </HeaderTab>
              <HeaderTab active={view === "verses"} onClick={() => go("verses")} badge={0}>
                Verses
              </HeaderTab>
            </nav>
            <Button variant="ghost" size="icon" className="ml-auto hidden md:ml-0 md:inline-flex" aria-label="Settings" onClick={() => openPanel({ kind: "settings" })}>
              <SettingsIcon />
            </Button>
          </div>
        </header>

        {/* Room at the bottom for the tab bar on a phone */}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-6 md:pb-8">
          {view === "review" ? <ReviewView day={day} /> : <VersesView day={day} />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-safe backdrop-blur-md md:hidden">
          <div className="grid h-16 grid-cols-3">
            <BottomTab icon={<BookOpenCheckIcon />} label="Review" active={view === "review"} badge={due} onClick={() => go("review")} />
            <BottomTab icon={<LibraryIcon />} label={count > 0 ? `Verses · ${count}` : "Verses"} active={view === "verses"} onClick={() => go("verses")} />
            <BottomTab icon={<SettingsIcon />} label="Settings" active={false} onClick={() => openPanel({ kind: "settings" })} />
          </div>
        </nav>
      </div>
      <Panels day={day} />
      <Toaster position="top-center" richColors closeButton theme={document.documentElement.classList.contains("dark") ? "dark" : "light"} offset={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }} />
    </>
  );
}

function HeaderTab({ active, onClick, badge, children }: { active: boolean; onClick: () => void; badge: number; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      {children}
      {badge > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">{badge}</span>}
    </button>
  );
}

function BottomTab({ icon, label, active, badge = 0, onClick }: { icon: ReactNode; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:bg-muted/60 [&_svg]:size-6",
        active ? "text-primary" : "text-muted-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-3 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background">
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

/** The one dialog open, if any */
function Panels({ day }: { day: string }) {
  const panel = useUi((s) => s.panel);
  const verses = useApp((s) => s.verses);
  const moving = panel?.kind === "move" ? verses.find((v) => v.id === panel.verseId) : undefined;
  return (
    <Dialog open={panel !== null} onOpenChange={(open) => !open && closePanel()}>
      {panel?.kind === "edit" && <EditDialog key={panel.verseId ?? "new"} verseId={panel.verseId} queue={panel.queue} day={day} />}
      {panel?.kind === "import" && <ImportDialog day={day} />}
      {panel?.kind === "settings" && <SettingsDialog />}
      {panel?.kind === "translations" && <TranslationDialog onDone={() => openPanel({ kind: "settings" })} />}
      {moving && <MoveDialog verse={moving} day={day} />}
    </Dialog>
  );
}
