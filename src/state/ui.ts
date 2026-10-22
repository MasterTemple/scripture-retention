import { create } from "zustand";

export type View = "review" | "verses";

export type SettingsTab = "review" | "schedule" | "reminders" | "bible" | "appearance" | "data";

export type Panel =
  | { kind: "edit"; verseId: string | null; queue?: boolean; deck?: string }
  | { kind: "move"; verseId: string }
  | { kind: "import" }
  | { kind: "settings" }
  | { kind: "translations" }
  /** Adding a passage (`passageId` null), in `deck`, or seeing one */
  | { kind: "passage"; passageId: string | null; deck?: string }
  /** Adding a deck (`deckId` null), or renaming or deleting one */
  | { kind: "deck"; deckId: string | null };

interface Ui {
  view: View;
  /** The dialogs open, bottom first: one opened from another opens over it, and closing it goes back */
  panels: Panel[];
  /** The settings tab open last, opened again with them */
  settingsTab: SettingsTab;
  /** The deck the Verses view shows (all of them when null) */
  versesDeck: string | null;
}

/**
 * What's showing: the view comes from the address (`?view=verses`, `?view=import`), so a
 * bookmark or a notification can open either
 */
function fromAddress(): Ui {
  const view = new URLSearchParams(location.search).get("view");
  return { view: view === "verses" || view === "import" ? "verses" : "review", panels: view === "import" ? [{ kind: "import" }] : [], settingsTab: "review", versesDeck: null };
}

export const useUi = create<Ui>()(() => fromAddress());

/** Opens a dialog over those open (in place of the top one, when it's the same kind) */
export const openPanel = (panel: Panel) =>
  useUi.setState((s) => ({ panels: s.panels.at(-1)?.kind === panel.kind ? [...s.panels.slice(0, -1), panel] : [...s.panels, panel] }));

/** Closes the top dialog, going back to the one under it */
export const closePanel = () => useUi.setState((s) => ({ panels: s.panels.slice(0, -1) }));

/** Closes a dialog and those over it */
export const closePanelsFrom = (index: number) => useUi.setState((s) => ({ panels: s.panels.slice(0, index) }));

export function showView(view: View) {
  useUi.setState({ view });
  const url = new URL(location.href);
  if (view === "review") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  history.replaceState(null, "", url);
}

/** The address that opens a view, for bookmarks, shortcuts, and notifications */
export function viewUrl(view: View | "import"): string {
  const url = new URL(location.href);
  url.search = view === "review" ? "" : `?view=${view}`;
  url.hash = "";
  return url.href;
}
