/**
 * Keeps `--keyboard` on the root at the height an on-screen keyboard covers. iOS Safari leaves
 * the layout as it is when the keyboard opens and covers its bottom, so a sheet set at
 * `bottom: 0` would sit under the keyboard; this lifts it. Elsewhere it stays 0.
 */
export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Less than this is a browser's toolbar coming and going, not a keyboard
    document.documentElement.style.setProperty("--keyboard", `${covered > 80 ? Math.round(covered) : 0}px`);
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}
