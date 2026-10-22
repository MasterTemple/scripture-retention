import type { Translation } from "./types";

/** fetch.bible serves each book as its own file, with CORS, so books download as they're needed */
export const FETCH_BIBLE = "https://v1.fetch.bible";

export const fetchBookUrl = (fetchId: string, usfmCode: string) =>
  `${FETCH_BIBLE}/bibles/${fetchId}/usx/${usfmCode.toLowerCase()}.usx`;

const fetched = (id: string, abbreviation: string, name: string, attribution: string, attributionUrl: string): Translation => ({
  id: `fetch:${id}`,
  name,
  abbreviation,
  source: { kind: "fetch", id },
  language: "eng",
  attribution,
  attributionUrl,
});

export const BUILT_IN: Translation[] = [
  fetched("eng_bsb", "BSB", "Berean Standard Bible", "BSB Publishing, LLC (public domain)", "https://berean.bible/"),
  fetched("eng_kjv", "KJV", "King James Version (1769)", "Public domain", "https://ebible.org/Scriptures/details.php?id=eng-kjv2006"),
  fetched("eng_web", "WEB", "World English Bible", "Public domain", "https://ebible.org/Scriptures/details.php?id=eng-web"),
  fetched("eng_asv", "ASV", "American Standard Version (1901)", "Public domain", "https://ebible.org/Scriptures/details.php?id=eng-asv"),
  fetched("eng_lsv", "LSV", "Literal Standard Version", "Covenant Press (CC BY-SA 4.0)", "https://www.lsvbible.com/"),
  fetched("eng_ylt", "YLT", "Young's Literal Translation (1898)", "Public domain", "https://ebible.org/Scriptures/details.php?id=engylt"),
];

export const DEFAULT_TRANSLATION = BUILT_IN[0]!.id;

/** One entry of fetch.bible's manifest, for browsing the rest of its translations */
export interface CatalogBible {
  fetchId: string;
  name: string;
  localName: string;
  abbreviation: string;
  language: string;
  languageName: string;
  year: number | null;
  attribution: string;
  attributionUrl: string;
  recommended: boolean;
}

interface Manifest {
  bibles: Record<string, {
    name: { local: string; local_abbrev: string; english: string; english_abbrev: string };
    year: number | null;
    copyright: { attribution: string; attribution_url: string };
    tags: string[];
    books_ot: boolean | string[];
    books_nt: boolean | string[];
  }>;
  languages: Record<string, { local: string; english: string }>;
}

let catalog: Promise<CatalogBible[]> | null = null;

/** fetch.bible's 1,400 translations (about 750 KB, fetched once when browsing) */
export function loadCatalog(): Promise<CatalogBible[]> {
  catalog ??= fetch(`${FETCH_BIBLE}/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Couldn't load fetch.bible's list (${r.status})`);
      return r.json() as Promise<Manifest>;
    })
    .then((m) =>
      Object.entries(m.bibles).map(([fetchId, b]) => {
        const language = fetchId.split("_")[0]!;
        return {
          fetchId,
          name: b.name.english || b.name.local,
          localName: b.name.local,
          abbreviation: b.name.english_abbrev || b.name.local_abbrev || fetchId,
          language,
          languageName: m.languages[language]?.english ?? language,
          year: b.year,
          attribution: b.copyright.attribution,
          attributionUrl: b.copyright.attribution_url,
          recommended: b.tags.includes("recommended"),
        };
      }),
    )
    .catch((error) => {
      catalog = null;
      throw error;
    });
  return catalog;
}

export const fromCatalog = (b: CatalogBible): Translation => ({
  id: `fetch:${b.fetchId}`,
  name: b.name,
  abbreviation: b.abbreviation,
  source: { kind: "fetch", id: b.fetchId },
  language: b.language,
  attribution: b.attribution,
  attributionUrl: b.attributionUrl,
});
