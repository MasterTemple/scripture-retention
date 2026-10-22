/** An accent: a hue (0-360, as OKLCH measures it) and how vivid it is (1 full, near 0 grey) */
export interface Accent {
  hue: number;
  chroma: number;
}

export const ACCENTS: { name: string; accent: Accent }[] = [
  { name: "Indigo", accent: { hue: 278, chroma: 1 } },
  { name: "Blue", accent: { hue: 250, chroma: 1 } },
  { name: "Teal", accent: { hue: 195, chroma: 0.8 } },
  { name: "Green", accent: { hue: 150, chroma: 0.85 } },
  { name: "Amber", accent: { hue: 70, chroma: 0.8 } },
  { name: "Orange", accent: { hue: 45, chroma: 1 } },
  { name: "Red", accent: { hue: 25, chroma: 1.1 } },
  { name: "Rose", accent: { hue: 355, chroma: 1 } },
  { name: "Purple", accent: { hue: 310, chroma: 1 } },
  { name: "Graphite", accent: { hue: 278, chroma: 0.12 } },
];

export const DEFAULT_ACCENT = ACCENTS[0]!.accent;

export const sameAccent = (a: Accent, b: Accent) => Math.round(a.hue) === Math.round(b.hue) && Math.abs(a.chroma - b.chroma) < 0.01;

/** Hues the weekly (green) and monthly (orange) phases are shown in */
const PHASE_HUES = [155, 57];

/**
 * Sets the accent on the page (the stylesheet's colors follow `--accent-h` and `--accent-c`).
 * The daily phase is shown in the accent, unless it's close to the weekly or
 * monthly phase's color, when it stays indigo so the three can be told apart.
 */
export function applyAccent(accent: Accent) {
  const root = document.documentElement.style;
  root.setProperty("--accent-h", String(accent.hue));
  root.setProperty("--accent-c", String(accent.chroma));
  const near = accent.chroma > 0.4 && PHASE_HUES.some((h) => Math.min(Math.abs(accent.hue - h), 360 - Math.abs(accent.hue - h)) < 40);
  const grey = accent.chroma < 0.4;
  if (near || grey) {
    root.setProperty("--daily-h", String(DEFAULT_ACCENT.hue));
    root.setProperty("--daily-c", String(DEFAULT_ACCENT.chroma));
  } else {
    root.removeProperty("--daily-h");
    root.removeProperty("--daily-c");
  }
}

/** The accent a picked color gives: its hue, and how vivid it is (a grey gives a near-grey accent) */
export function accentFromHex(hex: string): Accent {
  const n = parseInt(hex.replace("#", ""), 16);
  const linear = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const [r, g, b] = linear;
  // Linear sRGB to OKLab (Björn Ottosson's matrices)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  const chroma = Math.hypot(A, B);
  // A vivid color (chroma ~0.15 and up) gives the full accent
  return { hue: Math.round(hue), chroma: Math.round(Math.min(1.1, Math.max(0.08, chroma / 0.15)) * 100) / 100 };
}

/** A color for a swatch of the accent, as the light theme shows it */
export const swatch = (a: Accent) => `oklch(0.55 ${0.17 * a.chroma} ${a.hue})`;
