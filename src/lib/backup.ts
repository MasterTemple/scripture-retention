import { toast } from "sonner";
import { makeBackup, readBackup } from "@/core/backup";
import { mergeSrs, type SrsOptions } from "@/core/srs";
import { reviewDay, useApp, type Settings } from "@/state/store";
import { startReview } from "@/state/review";

/** Saves everything, review history and all, as a file */
export function downloadBackup() {
  const { verses, queue, queueChecked, settings } = useApp.getState();
  const text = JSON.stringify(makeBackup({ verses, queue, queueChecked, settings }), null, 1);
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
    settings: {
      ...previous.settings,
      ...saved,
      durations: { ...previous.settings.durations, ...saved.durations },
      autoStart: { ...previous.settings.autoStart, ...saved.autoStart },
      reminders: { ...previous.settings.reminders, ...saved.reminders },
      srs: mergeSrs(saved.srs as Partial<SrsOptions> | undefined),
    },
  });
  startReview();
  const { verses, queue, queueChecked, settings } = previous;
  toast.success(`Restored ${backup.verses.length} ${backup.verses.length === 1 ? "verse" : "verses"}`, {
    action: { label: "Undo", onClick: () => (useApp.setState({ verses, queue, queueChecked, settings }), startReview()) },
  });
  return true;
}
