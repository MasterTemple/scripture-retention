/**
 * Keeps two variables on the root for an on-screen keyboard: `--keyboard`, the height it covers
 * at the bottom, and `--viewport-h`, the height left showing. iOS Safari leaves the layout as it
 * is when the keyboard opens and covers its bottom, and pans the page up to show the field; a
 * sheet lifted by `--keyboard` and no taller than `--viewport-h` stays in view, its top too.
 * Elsewhere (where the keyboard resizes the page) `--keyboard` stays 0.
 */
export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement.style;
  const update = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Less than this is a browser's toolbar coming and going, not a keyboard
    root.setProperty("--keyboard", `${covered > 80 ? Math.round(covered) : 0}px`);
    root.setProperty("--viewport-h", `${Math.round(vv.height)}px`);
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();

  // A field focused in a sheet scrolls into view in it once the keyboard is up (it takes a
  // moment to slide in, and a field near the bottom would be under it until then)
  document.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement) || !field.matches("input:not([type=checkbox]):not([type=range]), textarea, select")) return;
    if (!field.closest("[role=dialog]")) return;
    setTimeout(() => field.scrollIntoView({ block: "nearest" }), 350);
  });
}
