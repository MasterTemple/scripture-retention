import { create } from "zustand";

export type View = "review" | "verses";

export type Panel =
  | { kind: "edit"; verseId: string | null }
  | { kind: "move"; verseId: string }
  | { kind: "import" }
  | { kind: "settings" }
  | { kind: "translations" }
  | null;

interface Ui {
  view: View;
  panel: Panel;
}

/**
 * What's showing: the view comes from the address (`?view=verses`, `?view=import`), as the
 * plugin's `obsidian://` links did, so a bookmark or a notification can open either
 */
function fromAddress(): Ui {
  const view = new URLSearchParams(location.search).get("view");
  return { view: view === "verses" || view === "import" ? "verses" : "review", panel: view === "import" ? { kind: "import" } : null };
}

export const useUi = create<Ui>()(() => fromAddress());

export const openPanel = (panel: Panel) => useUi.setState({ panel });
export const closePanel = () => useUi.setState({ panel: null });

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
