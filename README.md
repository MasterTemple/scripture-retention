# Scripture Retention

Keep the Scripture you've already memorized, after the *Scripture Memorization and Meditation System*
Tom Frost uses at the [Foundation for Reasonable Christianity](https://www.reasonablechristianity.org/).
Each verse is said aloud (its topic, its reference, then the verse):

1. once a day, every day, for 7 weeks;
2. once a week, every week, for 7 months;
3. once a month, every month, for 7 years.

It isn't for memorizing a verse, but for retaining one and meditating on it. Adding a verse a week
fills the daily, weekly, and monthly windows over 7 years, after which the review takes 5-10
minutes a day.

**Use it: [mastertemple.github.io/scripture-retention](https://mastertemple.github.io/scripture-retention/)**

The web version of the Scripture Retention Obsidian plugin, made for phones first.

## Reviewing

**Review** shows one card at a time: the topic (`#guard-your-heart`) and the reference. Say them and the
verse, then tap the card (or swipe it, or **Continue**) to see the verse, and **Next** to go on; swipe
right to go back. **Move** puts the verse in another bucket and how far into it ("week 3 of the weekly
reviews"), working out the start date that puts it there today; a moved verse counts as reviewed. On a
computer, Space or Enter does Continue and Next, ← goes back, and M moves.

A verse is due on its scheduled day (every day, then every 7 days, then the same day each month) and
stays due until it's reviewed, so a missed weekly or monthly verse comes up the next day.

The verse's text comes from [fetch.bible](https://fetch.bible) in the translation chosen in Settings
(BSB, KJV, WEB, ASV, LSV, YLT, or any of its ~1,400). Each book downloads the first time it's needed and
is kept on the device, and the books of every card due are fetched as the review starts.

## Verses

**Verses** lists every verse by where it is (daily, weekly, monthly, upcoming, retained); tap one to change
its topic, reference, or place in the schedule, or to delete it. Where a verse is follows from one date
alone: the day its daily reviews began.

**Import** adds a whole list at once, one verse a line:

```
Once a day:
`#before-my-eyes` Psalm 101:3
`#in-the-night` Psalms 119:55 @day 12

Once a week:
`#guard-your-heart` Proverbs 4:23
`#assurance` 1 John 5:13 @week 3
`#desire` Proverbs 6:25 @2026-01-04
```

A heading (`Once a day:`, `Weekly:`, `## Monthly`) puts the verses below it in that bucket, at its first
review today; `@day 12`, `@week 3`, `@month 5` place one further in, and `@2026-01-04` gives its start
date outright. The topic and backticks are optional; `#?` is a verse without a topic yet. **Copy all as
a list** (or Share, or Save as a file) exports them in the same form, with start dates, so it imports
back the same, including into the Obsidian plugin.

Your verses are kept in this browser only (localStorage), so save a copy now and then.

## Install it, links, and reminders

It's an installable web app that works offline. On an iPhone or iPad, open it in Safari, tap Share, then
**Add to Home Screen**; on Android or desktop Chrome and Edge, use **Install app** in the browser's menu.

- `…/scripture-retention/` opens today's review
- `…/scripture-retention/?view=verses` opens the list
- `…/scripture-retention/?view=import` opens the import dialog

Settings has each link ready to copy. `scriptable/scripture-review.js` is a
[Scriptable](https://scriptable.app) script that schedules a daily notification opening the review.

## Settings

Order (daily, weekly, monthly; or shuffled), the hour a new day begins, the translation, the text size,
the theme, and how long each phase lasts (7 weeks, 7 months, 7 years).

## How it's built

- React 19, TypeScript, Vite, Tailwind CSS v4, and Radix primitives (shadcn-style components in `src/components/ui`)
- `src/core/` (dates, the schedule, lists) is the Obsidian plugin's, with no browser imports
- [topos-bible](https://www.npmjs.com/package/topos-bible) reads references and completes them as they're typed (`src/bible/topos.ts`)
- [logoxide](https://www.npmjs.com/package/logoxide) reads fetch.bible's USX in a Web Worker, so its WebAssembly only loads when a book is first needed (`src/bible/library.ts`, `src/bible/worker.ts`)
- zustand for state (verses and settings persist in localStorage)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app) makes it installable and caches the app for offline use; a new version waits for you to reload

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (dates, the schedule, lists, verse text)
npm run build      # static site in dist/
```

The build is a static site with no server or API keys, and its URLs are relative, so it can be hosted
under any path. Each push to `main` tests, builds, and deploys it to GitHub Pages
(`.github/workflows/deploy.yml`).
