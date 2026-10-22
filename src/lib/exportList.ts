import { toast } from "sonner";
import { formatList } from "@/core/lists";
import { reviewDay, useApp } from "@/state/store";

/** Every verse as a list that imports back the same (each with its start date) */
export function listText(): string {
  const { verses, queue, settings } = useApp.getState();
  return formatList(verses, reviewDay(), settings.durations, queue);
}

export async function copyList() {
  const { verses, queue } = useApp.getState();
  const count = verses.length + queue.length;
  try {
    await navigator.clipboard.writeText(listText());
    toast.success(`Copied ${count} ${count === 1 ? "verse" : "verses"}`);
  } catch {
    toast.error("Couldn't copy: try Save as a file instead");
  }
}

export function downloadList() {
  const url = URL.createObjectURL(new Blob([listText()], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `scripture-retention-${reviewDay()}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const canShare = () => typeof navigator !== "undefined" && "share" in navigator;

/** The phone's share sheet, to send the list to Notes, Files, a message, or anywhere */
export async function shareList() {
  try {
    await navigator.share({ title: "Scripture Retention verses", text: listText() });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast.error("Couldn't share the list");
  }
}
