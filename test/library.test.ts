import { Logoxide } from "logoxide";
import { describe, expect, it } from "vitest";
import { isCurrent, READER } from "@/bible/library";
import type { Translation } from "@/bible/types";

const fetched: Translation = { id: "fetch:eng_bsb", name: "Berean Standard Bible", abbreviation: "BSB", source: { kind: "fetch", id: "eng_bsb" } };
const uploaded: Translation = { id: "upload:mine", name: "Mine", abbreviation: "MINE", source: { kind: "upload" } };
const book = { bookId: 43, verses: {} };

describe("saved books", () => {
  it("names the parser and logoxide's text version", () => {
    expect(READER).toMatch(/^\d+\/logoxide /);
    expect(READER.endsWith(Logoxide.new().textVersion())).toBe(true);
  });

  it("downloads again what another reader read, but keeps uploads", () => {
    expect(isCurrent({ ...book, reader: READER }, fetched)).toBe(true);
    expect(isCurrent(book, fetched)).toBe(false);
    expect(isCurrent({ ...book, reader: "1/logoxide 0.0.1" }, fetched)).toBe(false);
    expect(isCurrent(book, uploaded)).toBe(true);
  });
});
