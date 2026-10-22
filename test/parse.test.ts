import { readFileSync } from "node:fs";
import { Logoxide, Topos } from "logoxide";
import { describe, expect, it } from "vitest";
import { clean, readBook, readFiles } from "@/bible/parse";

const lx = Logoxide.new();
const topos = Topos.new();
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("readBook", () => {
  it("reads USX", () => {
    const book = readBook(lx, topos, "usx", fixture("jhn_bsb.usx"))!;
    expect(book.bookId).toBe(43);
    // The BSB leaves John 5:4 to a footnote
    expect(Object.keys(book.verses)).toHaveLength(878);
    expect(book.verses["5:4"]).toBeUndefined();
    expect(book.verses["3:16"]!.text).toBe(
      "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.",
    );
  });

  it("reads USFM, without paragraph marks", () => {
    const book = readBook(lx, topos, "usfm", fixture("3jn_kjv.usfm"))!;
    expect(book.bookId).toBe(64);
    expect(book.verses["1:1"]!.text).toMatch(/^The elder unto the wellbeloved Gaius/);
    expect(Object.values(book.verses).some((v) => v.text.includes("¶"))).toBe(false);
  });

  it("reads a verse printed in parts whole", () => {
    const usfm = "\\id 3JN\n\\c 1\n\\p\n\\v 1 One.\n\\v 2a Two begins,\n\\p\n\\v 2b and ends.\n\\v 3 Three.\n";
    const book = readBook(lx, topos, "usfm", usfm)!;
    expect(book.verses["1:2"]).toEqual({ text: "Two begins, and ends." });
    expect(Object.keys(book.verses)).toEqual(["1:1", "1:2", "1:3"]);
  });

  it("shares the text of verses printed together, within and across chapters", () => {
    const usfm = "\\id GEN\n\\c 1\n\\p\n\\v 1 One.\n\\v 2-3 Two and three.\n\\v 31-2:1 The end and the start.\n\\c 2\n\\p\n\\v 2 Two.\n";
    const book = readBook(lx, topos, "usfm", usfm)!;
    expect(book.verses["1:3"]).toEqual({ text: "Two and three.", span: [2, 3] });
    const bridge = { text: "The end and the start.", span: [31, 1], chapters: [1, 2] };
    expect(book.verses["1:31"]).toEqual(bridge);
    expect(book.verses["2:1"]).toEqual(bridge);
    expect(book.verses["2:2"]).toEqual({ text: "Two." });
  });
});

describe("clean", () => {
  it("composes, and drops invisible characters but not a script's joiners", () => {
    expect(clean(" ¶ Cafe\u0301\u00A0a\u200Bb c\u00ADd e\u2060f\uFEFF  g ")).toBe("Caf\u00E9 ab cd ef g");
    expect(clean("\u0645\u06CC\u200C\u0634\u0648\u062F")).toBe("\u0645\u06CC\u200C\u0634\u0648\u062F");
  });

  it("is applied to every verse", () => {
    const book = readBook(lx, topos, "usfm", "\\id 3JN\n\\c 1\n\\p\n\\v 1 Cafe\u0301 a\u200Bb.\n")!;
    expect(book.verses["1:1"]!.text).toBe("Caf\u00E9 ab.");
  });
});

describe("files", () => {
  it("reads several, skipping what isn't a book", () => {
    const enc = new TextEncoder();
    const { books, skipped } = readFiles(lx, topos, [
      { name: "JHN.usx", bytes: enc.encode(fixture("jhn_bsb.usx")) },
      { name: "64-3JN.SFM", bytes: enc.encode(fixture("3jn_kjv.usfm")) },
      { name: "cover.png", bytes: new Uint8Array([1, 2, 3]) },
    ]);
    expect(books.map((b) => b.bookId)).toEqual([43, 64]);
    expect(skipped).toEqual(["cover.png"]);
  });

  it("skips a book without verses, and finds none in files of no book", () => {
    const enc = new TextEncoder();
    const empty = { name: "JUD.usfm", bytes: enc.encode("\\id JUD\n\\c 1\n") };
    const { books, skipped } = readFiles(lx, topos, [empty, { name: "64-3JN.SFM", bytes: enc.encode(fixture("3jn_kjv.usfm")) }]);
    expect(books.map((b) => b.bookId)).toEqual([64]);
    expect(skipped).toEqual(["JUD.usfm"]);
    expect(readFiles(lx, topos, [{ name: "notes.txt", bytes: enc.encode("hello") }])).toEqual({ books: [], skipped: ["notes.txt"] });
  });
});

describe("OSIS", () => {
  const osis = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace"><osisText osisIDWork="T" osisRefWork="Bible"><header><work osisWork="T"><title>T</title></work></header>${body}</osisText></osis>`;
  const phlm = `<div type="book" osisID="Phlm"><chapter osisID="Phlm.1"><div type="section"><title>Greeting</title><p><verse osisID="Phlm.1.1">Paul, a prisoner.</verse></p></div></chapter></div>`;
  const jude = `<div type="book" osisID="Jude"><chapter osisID="Jude.1"><verse osisID="Jude.1.1">Jude, a servant.</verse><verse osisID="Jude.1.2">Mercy to you.</verse></chapter></div>`;

  it("reads each book of a whole Bible", () => {
    const bible = osis(`<div type="bookGroup">${phlm}${jude}</div>`);
    const { books, skipped } = readFiles(lx, topos, [{ name: "bible.xml", bytes: new TextEncoder().encode(bible) }]);
    expect(skipped).toEqual([]);
    expect(books.map((b) => b.bookId)).toEqual([57, 65]);
    expect(books[0]!.verses).toEqual({ "1:1": { text: "Paul, a prisoner." } });
    expect(Object.keys(books[1]!.verses)).toEqual(["1:1", "1:2"]);
  });

  it("reads each book of a whole Bible whose books are milestones", () => {
    const bible = osis(`<div type="book" sID="b1" osisID="Phlm"/><chapter osisID="Phlm.1"><verse osisID="Phlm.1.1">Paul.</verse></chapter><div eID="b1"/><div type="book" sID="b2" osisID="Jude"/><chapter osisID="Jude.1"><verse osisID="Jude.1.1">Jude.</verse></chapter><div eID="b2"/>`);
    const { books } = readFiles(lx, topos, [{ name: "bible.xml", bytes: new TextEncoder().encode(bible) }]);
    expect(books.map((b) => [b.bookId, b.verses["1:1"]!.text])).toEqual([[57, "Paul."], [65, "Jude."]]);
  });
});

describe("zips", () => {
  it("reads a whole Bible's books from any folder, quietly passing over the rest", () => {
    const progress: number[] = [];
    const zip = new Uint8Array(readFileSync(new URL("./fixtures/bible.zip", import.meta.url)));
    const { books, skipped } = readFiles(lx, topos, [{ name: "Bible.ZIP", bytes: zip }], (done) => progress.push(done));
    expect(books.map((b) => b.bookId).sort()).toEqual([43, 64]);
    expect(skipped).toEqual([]);
    expect(progress).toEqual([0, 1, 2]);
  });
});
