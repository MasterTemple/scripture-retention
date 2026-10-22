import { Trash2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/overlays";
import { Input, Label } from "@/components/ui/primitives";
import { DEFAULT_DECK, deckOf } from "@/core/decks";
import { useApp } from "@/state/store";
import { closePanel, useUi } from "@/state/ui";

/** Adds a deck (`deckId` null), or renames or deletes one with everything in it */
export function DeckDialog({ deckId }: { deckId: string | null }) {
  const deck = useApp((s) => (deckId ? s.decks.find((d) => d.id === deckId) : undefined));
  const count = useApp((s) => (deckId ? s.verses.filter((v) => deckOf(v) === deckId && !v.passage).length + s.passages.filter((p) => deckOf(p) === deckId).length : 0));
  const [name, setName] = useState(deck?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = useId();

  // A second tap deletes; the first only asks, and lapses
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("A deck needs a name");
      return;
    }
    const app = useApp.getState();
    if (deck) app.updateDeck(deck.id, { name: trimmed });
    else {
      const created = app.addDeck(trimmed);
      useUi.setState({ versesDeck: created });
      toast.success(`Added the ${trimmed} deck`);
    }
    closePanel();
  };

  const remove = () => {
    if (!deck || deck.id === DEFAULT_DECK) return;
    if (!confirmDelete) return setConfirmDelete(true);
    const before = useApp.getState();
    const saved = { decks: before.decks, verses: before.verses, passages: before.passages, queue: before.queue, settings: before.settings };
    before.removeDeck(deck.id);
    if (useUi.getState().versesDeck === deck.id) useUi.setState({ versesDeck: null });
    toast(`Deleted the ${deck.name} deck`, { action: { label: "Undo", onClick: () => useApp.setState(saved) } });
    closePanel();
  };

  return (
    <DialogContent
      title={deck ? "Deck" : "New deck"}
      description={deck ? undefined : "Verses and passages reviewed together, by the default schedule or a schedule of their own (Settings → Schedule)."}
      footer={
        <>
          {deck && deck.id !== DEFAULT_DECK && (
            <Button variant={confirmDelete ? "destructive" : "ghost"} className="mr-auto text-destructive data-[confirm=true]:text-white" data-confirm={confirmDelete} onClick={remove}>
              <Trash2Icon /> {confirmDelete ? `Delete it and its ${count === 1 ? "entry" : `${count} entries`}` : "Delete"}
            </Button>
          )}
          <Button onClick={save}>{deck ? "Save" : "Add"}</Button>
        </>
      }
    >
      <form
        className="space-y-2 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Label htmlFor={id}>Name</Label>
        <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="1 Peter" autoFocus enterKeyHint="done" />
        <button type="submit" hidden />
      </form>
    </DialogContent>
  );
}
