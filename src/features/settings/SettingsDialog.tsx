import { BellIcon, CalendarPlusIcon, CheckIcon, ChevronRightIcon, Loader2Icon, RefreshCwIcon, RotateCcwIcon, CopyIcon, DownloadIcon, ListPlusIcon, MinusIcon, MonitorIcon, MoonIcon, PlusIcon, Share2Icon, SunIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Input, Label, Select, Switch } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { WEEKDAYS } from "@/core/dates";
import type { Durations, Order } from "@/core/schedule";
import { canShare, copyList, downloadList, shareList } from "@/lib/exportList";
import { allowNotifications, canNotify, canWake, downloadCalendar, needsInstall } from "@/lib/reminders";
import type { Reminders } from "@/core/reminders";
import { cn } from "@/lib/utils";
import { checkForUpdate } from "@/lib/pwa";
import { resetDay } from "@/state/review";
import { reviewDay, useApp, useTranslation, type Theme } from "@/state/store";
import { openPanel, viewUrl } from "@/state/ui";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="px-5 py-3">
      <h3 className="pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ title, description, children, htmlFor }: { title: string; description?: ReactNode; children: ReactNode; htmlFor?: string }) {
  const Text = htmlFor ? Label : "div";
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <Text htmlFor={htmlFor} className="block min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        {description && <span className="block text-xs leading-snug font-normal text-muted-foreground">{description}</span>}
      </Text>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsDialog() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const count = useApp((s) => s.verses.length + s.queue.length);
  const ids = { day: useId(), start: useId(), steady: useId() };

  return (
    <DialogContent title="Settings" description="Saved on this device." onOpenAutoFocus={(e) => e.preventDefault()}>
      <Section title="Review">
        <Row title="Order" description={settings.order === "phase" ? "Daily verses first, then weekly, then monthly." : "All mixed together."}>
          <Segmented<Order>
            size="sm"
            value={settings.order}
            onChange={(order) => update({ order })}
            options={[
              { value: "phase", label: "By phase" },
              { value: "shuffle", label: "Shuffled" },
            ]}
          />
        </Row>
        <Row
          title="Keep the card steady"
          description={settings.steadyCard ? "The topic and reference stay where they are when the verse shows." : "The topic and reference show large and centered until the verse shows."}
          htmlFor={ids.steady}
        >
          <Switch id={ids.steady} checked={settings.steadyCard} onCheckedChange={(steadyCard) => update({ steadyCard })} />
        </Row>
        <ResetTodayRow />
        <Row title="New day begins at" description="Reviews before this hour count for the day before." htmlFor={ids.day}>
          <Select id={ids.day} className="w-32" value={settings.dayStartsAt} onChange={(e) => update({ dayStartsAt: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? "Midnight" : `${h}:00 AM`}
              </option>
            ))}
          </Select>
        </Row>
      </Section>

      <RemindersSection />

      <Section title="Queue">
        <Row title="Start a queued verse" description="The next one in the queue starts that day, in a week no verse has started yet." htmlFor={ids.start}>
          <Select
            id={ids.start}
            className="w-40"
            value={settings.autoStart.enabled ? settings.autoStart.weekday : "off"}
            onChange={(e) => update({ autoStart: e.target.value === "off" ? { ...settings.autoStart, enabled: false } : { enabled: true, weekday: Number(e.target.value) } })}
          >
            {WEEKDAYS.map((name, i) => (
              <option key={name} value={i}>
                Each {name}
              </option>
            ))}
            <option value="off">By hand</option>
          </Select>
        </Row>
      </Section>

      <Section title="Bible">
        <TranslationRow />
        <Row title="Text size">
          <Stepper
            value={settings.textScale}
            min={0.8}
            max={1.6}
            step={0.1}
            format={(n) => `${Math.round(n * 100)}%`}
            onChange={(textScale) => update({ textScale: Math.round(textScale * 10) / 10 })}
          />
        </Row>
      </Section>

      <Section title="Appearance">
        <Row title="Theme">
          <Segmented<Theme>
            size="sm"
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: "light", label: <SunIcon />, title: "Light" },
              { value: "dark", label: <MoonIcon />, title: "Dark" },
              { value: "system", label: <MonitorIcon />, title: "System" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Schedule" description="Changing these moves every verse, since where a verse is follows from its start date.">
        <DurationRow setting="dailyWeeks" title="Daily for" unit="weeks" />
        <DurationRow setting="weeklyMonths" title="Then weekly for" unit="months" />
        <DurationRow setting="monthlyYears" title="Then monthly for" unit="years" />
      </Section>

      <Section title="Your verses" description="They're kept in this browser only. Save a copy now and then; it imports back the same.">
        <div className="grid grid-cols-2 gap-2 py-3">
          <Button variant="outline" className="h-11 sm:h-9" onClick={() => openPanel({ kind: "import" })}>
            <ListPlusIcon /> Import
          </Button>
          <Button variant="outline" className="h-11 sm:h-9" onClick={copyList} disabled={count === 0}>
            <CopyIcon /> Copy list
          </Button>
          {canShare() && (
            <Button variant="outline" className="h-11 sm:h-9" onClick={shareList} disabled={count === 0}>
              <Share2Icon /> Share
            </Button>
          )}
          <Button variant="outline" className="h-11 sm:h-9" onClick={downloadList} disabled={count === 0}>
            <DownloadIcon /> Save file
          </Button>
        </div>
      </Section>

      <AppSection />

      <Section title="Links" description="For a bookmark or a home-screen shortcut.">
        <LinkRow title="Today's review" url={viewUrl("review")} />
        <LinkRow title="Your verses" url={viewUrl("verses")} />
        <LinkRow title="Import" url={viewUrl("import")} />
      </Section>
      <div className="h-2" />
    </DialogContent>
  );
}

function Stepper({ value, min, max, step, format, onChange, width = "w-14" }: { value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void; width?: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="size-10 sm:size-8" disabled={value <= min + 1e-9} onClick={() => onChange(value - step)} aria-label="Less">
        <MinusIcon />
      </Button>
      <span className={cn("text-center text-sm font-medium whitespace-nowrap tabular-nums", width)}>{format(value)}</span>
      <Button variant="outline" size="icon" className="size-10 sm:size-8" disabled={value >= max - 1e-9} onClick={() => onChange(value + step)} aria-label="More">
        <PlusIcon />
      </Button>
    </div>
  );
}

function DurationRow({ setting, title, unit }: { setting: keyof Durations; title: string; unit: string }) {
  const durations = useApp((s) => s.settings.durations);
  const update = useApp((s) => s.updateSettings);
  return (
    <Row title={title}>
      <Stepper
        value={durations[setting]}
        min={1}
        max={52}
        step={1}
        width="w-20"
        format={(n) => `${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`}
        onChange={(n) => update({ durations: { ...durations, [setting]: n } })}
      />
    </Row>
  );
}

function LinkRow({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Row title={title} description={<span className="break-all">{url}</span>}>
      <Button
        variant="outline"
        size="sm"
        className="h-10 sm:h-8"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Couldn't copy");
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
      </Button>
    </Row>
  );
}

/** The Bible verses are shown in; changed in its own dialog, which comes back here */
function TranslationRow() {
  const translation = useTranslation();
  return (
    <button className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/60 active:bg-muted" onClick={() => openPanel({ kind: "translations" })}>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-medium">Translation</span>
        <span className="block truncate text-xs text-muted-foreground">
          {translation.name}
          {translation.source.kind === "upload" ? " · uploaded" : ""}
        </span>
      </span>
      <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">{translation.abbreviation}</span>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </button>
  );
}

/**
 * Reminders to review each day and to add a verse each week: notifications where the browser can
 * send them, and the same reminders for the phone's calendar
 */
function RemindersSection() {
  const reminders = useApp((s) => s.settings.reminders);
  const update = useApp((s) => s.updateSettings);
  const [permission, setPermission] = useState(() => (canNotify() ? Notification.permission : "denied"));
  const ids = { review: useId(), reviewTime: useId(), verse: useId(), verseDay: useId(), verseTime: useId() };
  const set = (patch: Partial<Reminders>) => update({ reminders: { ...reminders, ...patch } });

  // Turning one on asks to notify, the first time
  const turnOn = async (patch: Partial<Reminders>) => {
    set(patch);
    if (canNotify() && Notification.permission === "default") setPermission(await allowNotifications());
  };

  let status: ReactNode;
  if (!canNotify()) status = "This browser can't show notifications: add the reminders to your calendar instead.";
  else if (needsInstall()) status = "On an iPhone or iPad, notifications come once the app is on the Home Screen (Share, then Add to Home Screen).";
  else if (permission === "denied") status = "Notifications are blocked for this site: allow them in the browser's site settings, or use your calendar.";
  else if (!canWake()) status = "This browser reminds you while the app is open in the background, not once it's closed. For a reminder that always comes, add them to your calendar.";
  else status = "Reminders come when your browser next wakes the app after the time set, which may be a little late. Your calendar keeps the time exactly.";

  return (
    <Section title="Reminders" description={typeof status === "string" ? status : undefined}>
      <div className="flex items-center justify-between gap-3 py-3">
        <Label htmlFor={ids.review} className="block min-w-0 flex-1 cursor-pointer space-y-0.5">
          <span className="block text-sm font-medium">Review each day</span>
          <span className="block text-xs font-normal text-muted-foreground">When verses are due</span>
        </Label>
        <Input
          id={ids.reviewTime}
          type="time"
          aria-label="Review reminder time"
          value={reminders.review.time}
          onChange={(e) => e.target.value && set({ review: { ...reminders.review, time: e.target.value } })}
          className="w-auto"
          disabled={!reminders.review.enabled}
        />
        <Switch id={ids.review} checked={reminders.review.enabled} onCheckedChange={(enabled) => void turnOn({ review: { ...reminders.review, enabled } })} />
      </div>
      <div className="space-y-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={ids.verse} className="block min-w-0 flex-1 cursor-pointer space-y-0.5">
            <span className="block text-sm font-medium">Add a new verse</span>
            <span className="block text-xs font-normal text-muted-foreground">When nothing is queued to start next</span>
          </Label>
          <Switch id={ids.verse} checked={reminders.newVerse.enabled} onCheckedChange={(enabled) => void turnOn({ newVerse: { ...reminders.newVerse, enabled } })} />
        </div>
        {reminders.newVerse.enabled && (
          <div className="flex gap-2">
            <Select
              id={ids.verseDay}
              aria-label="Day of the week"
              value={reminders.newVerse.weekday}
              onChange={(e) => set({ newVerse: { ...reminders.newVerse, weekday: Number(e.target.value) } })}
            >
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i}>
                  Each {name}
                </option>
              ))}
            </Select>
            <Input
              id={ids.verseTime}
              type="time"
              aria-label="New verse reminder time"
              value={reminders.newVerse.time}
              onChange={(e) => e.target.value && set({ newVerse: { ...reminders.newVerse, time: e.target.value } })}
              className="w-auto"
            />
          </div>
        )}
      </div>
      <div className="grid gap-2 py-3 sm:grid-cols-2">
        {canNotify() && permission === "default" && !needsInstall() && (
          <Button variant="outline" className="h-11 sm:h-9" onClick={async () => setPermission(await allowNotifications())}>
            <BellIcon /> Allow notifications
          </Button>
        )}
        <Button variant="outline" className="h-11 sm:h-9" disabled={!reminders.review.enabled && !reminders.newVerse.enabled} onClick={downloadCalendar}>
          <CalendarPlusIcon /> Add to my calendar
        </Button>
      </div>
    </Section>
  );
}

/** Makes the verses reviewed today due again */
function ResetTodayRow() {
  const day = reviewDay(useApp((s) => s.settings.dayStartsAt));
  const done = useApp((s) => s.verses.filter((v) => v.last === day).length);
  return (
    <Row title="Review today again" description={done > 0 ? `${done} ${done === 1 ? "verse" : "verses"} reviewed today become due again.` : "Nothing reviewed today yet."}>
      <Button
        variant="outline"
        size="sm"
        className="h-10 sm:h-8"
        disabled={done === 0}
        onClick={() => {
          const n = resetDay(day);
          toast.success(`${n} ${n === 1 ? "verse is" : "verses are"} due again`);
        }}
      >
        <RotateCcwIcon /> Reset
      </Button>
    </Row>
  );
}

/** Which version is running, and getting the newest one now */
function AppSection() {
  const [state, setState] = useState<"idle" | "checking">("idle");
  const check = async () => {
    setState("checking");
    const result = await checkForUpdate();
    setState("idle");
    if (result === "current") toast.success("You have the newest version");
    else if (result === "offline") toast.error("Couldn't check: you seem to be offline");
    else if (result === "unavailable") location.reload();
  };
  return (
    <Section title="App">
      <Row title="Check for updates" description={<>Version {__BUILD__}. Getting a new version reloads the app; your verses stay.</>}>
        <Button variant="outline" size="sm" className="h-10 sm:h-8" disabled={state === "checking"} onClick={check}>
          {state === "checking" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {state === "checking" ? "Checking…" : "Update"}
        </Button>
      </Row>
    </Section>
  );
}
