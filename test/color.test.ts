import { expect, test } from "vitest";
import { accentFromHex } from "../src/lib/color.ts";

test("a picked color's hue and vividness", () => {
  // OKLCH hues: sRGB red is about 29, green about 142, blue about 264
  expect(accentFromHex("#ff0000").hue).toBeCloseTo(29, -1);
  expect(accentFromHex("#00ff00").hue).toBeCloseTo(142, -1);
  expect(accentFromHex("#0000ff").hue).toBeCloseTo(264, -1);
  expect(accentFromHex("#5b5bd6").chroma).toBe(1.1);
  expect(accentFromHex("#808080").chroma).toBe(0.08);
});
