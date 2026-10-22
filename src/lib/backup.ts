import { toast } from "sonner";
import { makeBackup, readBackup } from "@/core/backup";
import { readDecks } from "@/core/decks";
import { mergeSrs, toAlgorithm } from "@/core/srs";
import { reviewDay, useApp, type Settings } from "@/state/store";
import { startReview } from "@/state/review";
import { useUi } from "@/state/ui";

/** Saves everything, review history and all, as a file */
export function downloadBackup() {
  const { verses, queue, queueChecked, settings, decks, passages } = useApp.getState();
  const text = JSON.stringify(makeBackup({ verses, queue, queueChecked, settings, decks, passages }), null, 1);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `scripture-retention-backup-${reviewDay()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Replaces everything with a backup's (settings saved before one existed keep their defaults) */
export async function restoreBackup(file: File): Promise<boolean> {
  const backup = readBackup(await file.text());
  if (typeof backup === "string") {
    toast.error(backup);
    return false;
  }
  const previous = useApp.getState();
  const saved = backup.settings as Partial<Settings>;
  useApp.setState({
    verses: backup.verses,
    queue: backup.queue,
    queueChecked: backup.queueChecked,
    decks: readDecks(backup.decks),
    passages: backup.passages ?? [],
    settings: {
      ...previous.settings,
      ...saved,
      durations: { ...previous.settings.durations, ...saved.durations },
      autoStart: { ...previous.settings.autoStart, ...saved.autoStart },
      reminders: { ...previous.settings.reminders, ...saved.reminders },
      srs: mergeSrs(saved.srs),
      algorithm: toAlgorithm(saved.algorithm),
    },
  });
  // A deck chosen to review or show that the backup doesn't have
  const restored = useApp.getState();
  if (!restored.decks.some((d) => d.id === restored.settings.reviewDeck)) useApp.setState({ settings: { ...restored.settings, reviewDeck: null } });
  useUi.setState({ versesDeck: null });
  startReview();
  const { verses, queue, queueChecked, settings, decks, passages } = previous;
  toast.success(`Restored ${backup.verses.length} ${backup.verses.length === 1 ? "verse" : "verses"}`, {
    action: { label: "Undo", onClick: () => (useApp.setState({ verses, queue, queueChecked, settings, decks, passages }), startReview()) },
  });
  return true;
}
