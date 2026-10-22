import { Trash2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Input, Label } from "@/components/ui/primitives";
import { describeDay, isDay, type Day } from "@/core/dates";
import { useApp } from "@/state/store";
import { closePanel } from "@/state/ui";
import { PositionPicker, StartSummary } from "./PositionPicker";
import { ReferenceInput } from "./ReferenceInput";

/** Adds a verse (`verseId` null) or edits one: its topic, reference, and where it is in the schedule */
export function EditDialog({ verseId, day }: { verseId: string | null; day: Day }) {
  const verse = useApp((s) => (verseId ? s.verses.find((v) => v.id === verseId) : undefined));
  const [tag, setTag] = useState(verse?.tag ?? "");
  const [ref, setRef] = useState(verse?.ref ?? "");
  const [start, setStart] = useState<Day>(verse?.start ?? day);
  const [date, setDate] = useState<string>(start);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = { tag: useId(), ref: useId(), date: useId() };

  useEffect(() => setDate(start), [start]);
  // A second tap deletes; the first only asks, and lapses
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const save = () => {
    if (!ref.trim()) {
      toast.error("A verse needs a reference");
      return;
    }
    const fields = { tag: tag.trim().replace(/^#/, ""), ref: ref.trim().replace(/\s+/g, " "), start };
    if (verse) useApp.getState().updateVerse(verse.id, fields);
    else useApp.getState().addVerses([fields]);
    toast.success(verse ? "Saved" : `Added ${fields.ref}`);
    closePanel();
  };

  const remove = () => {
    if (!verse) return;
    if (!confirmDelete) return setConfirmDelete(true);
    useApp.getState().removeVerse(verse.id);
    toast(`Deleted ${verse.ref}`, { action: { label: "Undo", onClick: () => useApp.setState((s) => ({ verses: [...s.verses, verse] })) } });
    closePanel();
  };

  return (
    <DialogContent
      title={verse ? "Edit verse" : "Add a verse"}
      onOpenAutoFocus={(e) => verse && e.preventDefault()}
      footer={
        <>
          {verse && (
            <Button variant={confirmDelete ? "destructive" : "ghost"} className="mr-auto text-destructive data-[confirm=true]:text-white" data-confirm={confirmDelete} onClick={remove}>
              <Trash2Icon /> {confirmDelete ? "Tap to delete" : "Delete"}
            </Button>
          )}
          <Button onClick={save}>{verse ? "Save" : "Add"}</Button>
        </>
      }
    >
      <form
        className="space-y-5 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={ids.ref}>Reference</Label>
          <ReferenceInput id={ids.ref} value={ref} onChange={setRef} autoFocus={!verse} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.tag}>Topic</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-primary">#</span>
            <Input
              id={ids.tag}
              value={tag}
              onChange={(e) => setTag(e.target.value.replace(/\s/g, "-"))}
              placeholder="guard-your-heart"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className="pl-6 font-medium text-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">A word or two to recall it by, said before the reference.</p>
        </div>

        <div className="space-y-3">
          <Label>Where it is today</Label>
          <PositionPicker start={start} day={day} onChange={setStart} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={ids.date} className="block space-y-1">
            <span className="block">Start date</span>
            <span className="block text-xs font-normal text-muted-foreground">The day its daily reviews began</span>
          </Label>
          <Input
            id={ids.date}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (isDay(e.target.value)) setStart(e.target.value);
            }}
            className="w-auto min-w-40"
          />
        </div>
        <StartSummary start={start} day={day} />
        {verse?.last && <p className="text-xs text-muted-foreground">Last reviewed {describeDay(verse.last)}</p>}
        {/* Enter in a field saves */}
        <button type="submit" hidden />
      </form>
    </DialogContent>
  );
}
