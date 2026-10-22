import { CheckIcon, ChevronRightIcon, CopyIcon, DownloadIcon, ListPlusIcon, MinusIcon, MonitorIcon, MoonIcon, PlusIcon, Share2Icon, SunIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Label, Select } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { WEEKDAYS } from "@/core/dates";
import type { Durations, Order } from "@/core/schedule";
import { canShare, copyList, downloadList, shareList } from "@/lib/exportList";
import { cn } from "@/lib/utils";
import { useApp, useTranslation, type Theme } from "@/state/store";
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
  const ids = { day: useId(), start: useId() };

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

      <Section title="Links" description="For a bookmark, a home-screen shortcut, or a daily reminder (see the README's Shortcuts and Scriptable notes).">
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
