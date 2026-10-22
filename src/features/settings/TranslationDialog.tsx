import { CheckIcon, CloudDownloadIcon, ExternalLinkIcon, FileUpIcon, GlobeIcon, HardDriveIcon, Loader2Icon, LibraryIcon, SearchIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { downloadedBooks, importFiles, removeTranslationBooks } from "@/bible/library";
import { BUILT_IN, fromCatalog, loadCatalog, type CatalogBible } from "@/bible/translations";
import type { Translation } from "@/bible/types";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/store";

type Tab = "bibles" | "upload" | "browse";

/** The Bible verses are shown in: the built-in ones, any of fetch.bible's, or one uploaded */
export function TranslationDialog({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<Tab>("bibles");
  return (
    <DialogContent title="Bible translation" description="Pick the text verses are shown in, or bring your own." className="sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
      <div className="sticky top-0 z-10 border-b bg-popover px-5 py-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: "bibles", label: <><LibraryIcon /> Bibles</> },
            { value: "upload", label: <><UploadIcon /> Upload</> },
            { value: "browse", label: <><GlobeIcon /> Browse more</> },
          ]}
        />
      </div>
      {tab === "bibles" && <Bibles onDone={onDone} />}
      {tab === "upload" && <Upload onDone={onDone} />}
      {tab === "browse" && <Browse onDone={onDone} />}
    </DialogContent>
  );
}

function useDownloaded() {
  const [saved, setSaved] = useState<Map<string, number[]>>(new Map());
  const [version, setVersion] = useState(0);
  useEffect(() => {
    downloadedBooks().then(setSaved, () => {});
  }, [version]);
  return [saved, () => setVersion((v) => v + 1)] as const;
}

function Bibles({ onDone }: { onDone: () => void }) {
  const current = useApp((s) => s.settings.translationId);
  const added = useApp((s) => s.settings.translations);
  const update = useApp((s) => s.updateSettings);
  const removeTranslation = useApp((s) => s.removeTranslation);
  const [saved, refresh] = useDownloaded();

  const choose = (t: Translation) => {
    update({ translationId: t.id });
    onDone();
  };

  const row = (t: Translation, removable: boolean) => {
    const books = saved.get(t.id)?.length ?? 0;
    const selected = t.id === current;
    return (
      <li key={t.id}>
        <div
          className={cn(
            "group flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
            selected ? "border-primary/40 bg-accent/60" : "border-transparent hover:bg-muted",
          )}
        >
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => choose(t)}>
            <span className={cn("flex h-8 min-w-12 items-center justify-center rounded-md px-1.5 text-xs font-bold tracking-wide", selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
              {t.abbreviation}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.name}</span>
              <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                {t.source.kind === "upload" ? (
                  <><HardDriveIcon className="size-3" /> Uploaded · {t.books?.length ?? books} books</>
                ) : books > 0 ? (
                  <><CheckIcon className="size-3 text-success" /> {books === 66 ? "All books saved" : `${books} ${books === 1 ? "book" : "books"} saved`}</>
                ) : (
                  <><CloudDownloadIcon className="size-3" /> Downloads as you go</>
                )}
                {t.attribution && <span className="hidden truncate sm:inline">· {t.attribution}</span>}
              </span>
            </span>
          </button>
          {selected && <CheckIcon className="size-4 shrink-0 text-primary" />}
          {(removable || books > 0) && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-10 shrink-0 opacity-60 group-hover:opacity-100 sm:size-8"
              aria-label={removable ? `Remove ${t.abbreviation}` : `Delete ${t.abbreviation}'s saved books`}
              title={removable ? "Remove" : "Delete saved books (they download again when needed)"}
              onClick={async () => {
                await removeTranslationBooks(t.id);
                if (removable) removeTranslation(t.id);
                refresh();
                toast.success(removable ? `Removed ${t.abbreviation}` : `Deleted ${t.abbreviation}'s saved books`);
              }}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-5 px-5 py-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ready to use</h3>
        <ul className="space-y-1">{BUILT_IN.map((t) => row(t, false))}</ul>
      </section>
      {added.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Added by you</h3>
          <ul className="space-y-1">{added.map((t) => row(t, true))}</ul>
        </section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Books download from{" "}
        <a href="https://fetch.bible" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          fetch.bible
        </a>{" "}
        as you practice them and stay saved on this device, so they work offline afterwards.
      </p>
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bible";

function Upload({ onDone }: { onDone: () => void }) {
  const addTranslation = useApp((s) => s.addTranslation);
  const added = useApp((s) => s.settings.translations);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const autoAbbreviation = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(of|the|and)$/i.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 6);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)]);
  };

  const submit = async () => {
    if (!files.length || !name.trim()) return;
    setBusy(true);
    setRead(null);
    const abbr = (abbreviation.trim() || autoAbbreviation || "MINE").toUpperCase();
    let id = `upload:${slug(name)}`;
    for (let n = 2; added.some((t) => t.id === id) || BUILT_IN.some((t) => t.id === id); n++) id = `upload:${slug(name)}-${n}`;
    try {
      const { books, skipped } = await importFiles(id, files, (done, total) => setRead({ done, total }));
      if (books.length === 0) {
        toast.error("No books found", { description: "Upload USFM (.usfm, .sfm), USX (.usx), or OSIS files, or a .zip of them." });
        return;
      }
      addTranslation({ id, name: name.trim(), abbreviation: abbr, source: { kind: "upload" }, books });
      toast.success(`Added ${abbr}`, {
        description: `${books.length} ${books.length === 1 ? "book" : "books"} imported${skipped.length ? `; skipped ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}` : ""}.`,
      });
      onDone();
    } catch (error) {
      toast.error("Couldn't read those files", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4 px-5 py-4" onSubmit={(e) => (e.preventDefault(), submit())}>
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-accent/50" : "hover:border-primary/40 hover:bg-muted/50",
        )}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <FileUpIcon className="size-7 text-muted-foreground" />
        <span className="text-sm font-medium">Choose files, or drop them here</span>
        <span className="text-xs text-muted-foreground">A .zip of a whole Bible in USFM or USX (like eBible.org's downloads), or single book files</span>
        <input type="file" multiple accept=".usfm,.sfm,.usx,.xml,.zip,.txt,.SFM,.USFM,.USX" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {files.slice(0, 12).map((f, i) => (
            <Badge key={`${f.name}-${i}`} variant="muted" className="max-w-48 truncate">
              {f.name}
            </Badge>
          ))}
          {files.length > 12 && <Badge variant="muted">+{files.length - 12} more</Badge>}
          <button type="button" className="ml-1 text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => setFiles([])}>
            Clear
          </button>
        </div>
      )}
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="upload-name">Name</Label>
          <Input id="upload-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New American Standard Bible" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="upload-abbr">Abbreviation</Label>
          <Input id="upload-abbr" value={abbreviation} onChange={(e) => setAbbreviation(e.target.value.toUpperCase().slice(0, 8))} placeholder={autoAbbreviation || "NASB"} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Files are read on this device with{" "}
        <a href="https://github.com/Logoxide/logoxide" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          logoxide
        </a>{" "}
        and never leave it. Verses whose books weren't uploaded say so on their card.
      </p>
      <div className="flex justify-end">
        <Button type="submit" className="max-sm:h-12 max-sm:w-full max-sm:text-base" disabled={busy || !files.length || !name.trim()}>
          {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} {busy ? (read && read.total > 1 ? `Reading ${read.done} of ${read.total} files…` : "Reading…") : "Add translation"}
        </Button>
      </div>
    </form>
  );
}

function Browse({ onDone }: { onDone: () => void }) {
  const addTranslation = useApp((s) => s.addTranslation);
  const [catalog, setCatalog] = useState<CatalogBible[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setError(e.message));
  }, []);

  const results = useMemo(() => {
    if (!catalog) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = catalog.filter((b) => {
      const hay = `${b.name} ${b.localName} ${b.abbreviation} ${b.languageName} ${b.language} ${b.year ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    // English first, then recommended, then by name
    return hits
      .sort((a, b) => Number(b.language === "eng") - Number(a.language === "eng") || Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [catalog, query]);

  let body: ReactNode;
  if (error) body = <p className="px-5 py-8 text-center text-sm text-muted-foreground">{error}</p>;
  else if (!catalog)
    body = (
      <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Loading fetch.bible's translations…
      </div>
    );
  else
    body = (
      <ul className="space-y-0.5 px-3 pb-4">
        {results.map((b) => (
          <li key={b.fetchId}>
            <button
              className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted active:bg-muted"
              onClick={() => {
                const t = fromCatalog(b);
                addTranslation(t);
                toast.success(`Added ${t.abbreviation}`, { description: t.name });
                onDone();
              }}
            >
              <span className="flex h-8 min-w-12 items-center justify-center rounded-md bg-muted px-1.5 text-[11px] font-bold">{b.abbreviation.slice(0, 8)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {b.name}
                  {b.recommended && <Badge className="ml-2 align-middle">Recommended</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {b.languageName}
                  {b.year ? ` · ${b.year}` : ""} · {b.attribution}
                </span>
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-2 py-8 text-center text-sm text-muted-foreground">No translations match “{query}”.</li>}
      </ul>
    );

  return (
    <div>
      <div className="px-5 pt-4 pb-3">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search 1,400 translations by name or language" className="pl-9" />
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          From{" "}
          <a href="https://fetch.bible" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
            fetch.bible <ExternalLinkIcon className="size-3" />
          </a>
          ; check each one's license before sharing its text.
        </p>
      </div>
      {body}
    </div>
  );
}

