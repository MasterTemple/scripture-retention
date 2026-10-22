import { CheckIcon, CopyIcon, DownloadIcon, ListPlusIcon, Loader2Icon, MinusIcon, MonitorIcon, MoonIcon, PlusIcon, SearchIcon, Share2Icon, SunIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BUILT_IN, fromCatalog, loadCatalog, type CatalogBible } from "@/bible/translations";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Input, Label, Select } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
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
  const count = useApp((s) => s.verses.length);
  const ids = { day: useId() };

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

      <Section title="Bible">
        <TranslationPicker />
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

/** The Bible verses are shown in: the built-in ones and those added, or any of fetch.bible's */
function TranslationPicker() {
  const translation = useTranslation();
  const added = useApp((s) => s.settings.translations);
  const update = useApp((s) => s.updateSettings);
  const id = useId();
  const [searching, setSearching] = useState(false);
  const all = [...BUILT_IN, ...added.filter((t) => !BUILT_IN.some((b) => b.id === t.id))];

  return (
    <div className="space-y-3 py-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="block min-w-0 space-y-0.5">
          <span className="block text-sm font-medium">Translation</span>
          <span className="block text-xs leading-snug font-normal text-muted-foreground">
            Each book downloads from fetch.bible the first time and is kept for offline use.
          </span>
        </Label>
        <Select id={id} className="w-32 shrink-0" value={translation.id} onChange={(e) => update({ translationId: e.target.value })}>
          {all.map((t) => (
            <option key={t.id} value={t.id}>
              {t.abbreviation}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {translation.name}
        {translation.attribution && (
          <>
            {" · "}
            {translation.attributionUrl ? (
              <a className="underline underline-offset-2" href={translation.attributionUrl} target="_blank" rel="noreferrer">
                {translation.attribution}
              </a>
            ) : (
              translation.attribution
            )}
          </>
        )}
      </p>
      {searching ? (
        <CatalogSearch
          onPick={(b) => {
            const t = fromCatalog(b);
            update({ translations: [...added.filter((x) => x.id !== t.id), t], translationId: t.id });
            setSearching(false);
          }}
        />
      ) : (
        <Button variant="link" className="h-auto px-0" onClick={() => setSearching(true)}>
          <SearchIcon /> Find another of fetch.bible's 1,400 translations
        </Button>
      )}
    </div>
  );
}

function CatalogSearch({ onPick }: { onPick: (b: CatalogBible) => void }) {
  const [catalog, setCatalog] = useState<CatalogBible[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    loadCatalog().then(setCatalog, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const results = useMemo(() => {
    if (!catalog) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = catalog.filter((b) => words.every((w) => `${b.name} ${b.localName} ${b.abbreviation} ${b.languageName}`.toLowerCase().includes(w)));
    return matches.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name)).slice(0, 40);
  }, [catalog, query]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return (
    <div className="space-y-2">
      <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, abbreviation, or language" enterKeyHint="search" />
      {!catalog ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Loading the list…
        </p>
      ) : (
        <ul className="max-h-72 divide-y overflow-y-auto overscroll-contain rounded-xl border scrollbar-thin">
          {results.map((b) => (
            <li key={b.fetchId}>
              <button className={cn("flex w-full items-baseline gap-3 px-3 py-2.5 text-left hover:bg-muted active:bg-muted")} onClick={() => onPick(b)}>
                <span className="w-16 shrink-0 truncate text-sm font-semibold">{b.abbreviation}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{b.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {b.languageName}
                    {b.year ? ` · ${b.year}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No translations match.</li>}
        </ul>
      )}
    </div>
  );
}
