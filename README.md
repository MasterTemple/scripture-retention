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
right to go back. The topic and reference stay where they are when the verse shows (turn off *Keep the
card steady* to show them large and centered until then). **Move** puts the verse in another bucket and how far into it ("week 3 of the weekly
reviews"), working out the start date that puts it there today; a moved verse counts as reviewed. On a
computer, Space or Enter does Continue and Next, ← goes back, and M moves.

A verse is due on its scheduled day (every day, then every 7 days, then the same day each month) and
stays due until it's reviewed, so a missed weekly or monthly verse comes up the next day.

## Bibles

The verse's text shows in the translation chosen in Settings:

- **Built in**: BSB, KJV, WEB, ASV, LSV, and YLT, from [fetch.bible](https://fetch.bible).
- **Browse more**: any of fetch.bible's ~1,400 translations.
- **Upload your own**: a `.zip` of a whole Bible in USFM or USX (for example eBible.org's `*_usfm.zip`),
  an OSIS file of one book or a whole Bible, or individual `.usfm`/`.sfm`/`.usx` book files. Files are
  read on your device and never uploaded anywhere.

Each downloaded book is fetched the first time it's needed and kept on the device (the books of every
card due are fetched as the review starts), so reviewing works offline.

## Verses

**Verses** lists every verse by where it is (daily, weekly, monthly, upcoming, retained); tap one to change
its topic, reference, or place in the schedule, or to delete it. Where a verse is follows from one date
alone: the day its daily reviews began.

## The queue

Queue verses to start later, so they don't need entering on the day: **Add a verse**, then *Queue it*
(or **+ Queue a verse** in the list). One starts each week on the day chosen in Settings (Monday unless
changed), in a week no verse has started yet; reorder them with the arrows, or turn it to *By hand* and
start each from its dialog. A day the app wasn't opened on still starts its verse, dated that day. A
verse can also be given a start date ahead, which puts it under *Upcoming*.

## Importing and exporting

**Import** adds a whole list at once, one verse a line:

```
Daily:
`#before-my-eyes` Psalm 101:3
`#in-the-night` Psalms 119:55 @day 12

Weekly:
`#guard-your-heart` Proverbs 4:23
`#assurance` 1 John 5:13 @week 3
`#desire` Proverbs 6:25 @2026-01-04

Monthly:
`#called` Romans 8:28 @month 5

Queue:
`#renewed` Romans 12:1-2
```

A heading (`Daily:`, `Weekly:`, `Monthly:`, or `## Daily` and so on) puts the verses below it in that bucket, at its first
review today; `@day 12`, `@week 3`, `@month 5` place one further in, and `@2026-01-04` gives its start
date outright; verses under `Queue:` are queued. The topic and backticks are optional; `#?` is a verse without a topic yet. **Copy all as
a list** (or Share, or Save as a file) exports them in the same form, with start dates, so it imports
back the same. The Obsidian plugin reads the same list, except that it has no queue.

Your verses are kept in this browser only (localStorage), so save a copy now and then.

## Install it

It's an installable web app (a PWA) that works offline. On an iPhone or iPad, open
[the site](https://mastertemple.github.io/scripture-retention/) in Safari, tap Share, then **Add to
Home Screen**; on Android or desktop Chrome and Edge, use **Install app** in the browser's menu.

## Reminders

Settings → *Reminders* has two, each with its time:

- **Review each day**, on days with verses due (7:00 AM unless changed);
- **Add a new verse**, one day a week (Monday unless changed), when nothing is queued or dated ahead
  to start next.

The site has no server, so it can't push a notification at an exact time the way a native app can.
What it can do:

- **Installed in Chrome or Edge** (Android, desktop): the browser wakes the app now and then (periodic
  background sync), and it shows any reminder whose time has passed. It may come somewhat after the time set.
- **Open in the background** (any browser that shows notifications): it reminds you at the time.
- **iPhone and iPad**: notifications need the app on the Home Screen, and Safari doesn't wake a closed app.
- **Add to my calendar** saves the reminders as repeating calendar events (an `.ics` file) that open the
  app. A phone's calendar alerts at the exact time with the app closed, on every phone, so it's the sure way.
- `scriptable/scripture-review.js` is a [Scriptable](https://scriptable.app) script for an iPhone that
  schedules a daily notification opening the review.

## Links

- [mastertemple.github.io/scripture-retention](https://mastertemple.github.io/scripture-retention/) opens today's review
- [mastertemple.github.io/scripture-retention/?view=verses](https://mastertemple.github.io/scripture-retention/?view=verses) opens the list
- [mastertemple.github.io/scripture-retention/?view=import](https://mastertemple.github.io/scripture-retention/?view=import) opens the import dialog

Settings has each link ready to copy, for a bookmark or a shortcut.

## Settings

Order (daily, weekly, monthly; or shuffled), keeping the card steady, showing the prompt to say the
verse aloud, the hour a new day begins, reminders, the day queued verses start, the translation, the
text size, the theme and accent color (one of ten, or any color you pick: its hue is used at a
lightness that stays readable in both themes), and how long each phase lasts (7 weeks, 7 months, 7
years). *Check for updates* gets a new version of the app now, and *Review today again* makes the
verses reviewed today due again.

## How it's built

- React 19, TypeScript, Vite, Tailwind CSS v4, and Radix primitives (shadcn-style components in `src/components/ui`)
- `src/core/` (dates, the schedule, lists) is the Obsidian plugin's, with the queue and reminders added; it has no browser imports, so the service worker uses it too
- [topos-bible](https://www.npmjs.com/package/topos-bible) reads references and completes them as they're typed (`src/bible/topos.ts`)
- [logoxide](https://www.npmjs.com/package/logoxide) reads USFM, USX, OSIS, and zips into per-verse text in a Web Worker, so its WebAssembly only loads when a book is first needed (`src/bible/parse.ts`, `src/bible/worker.ts`)
- zustand for state (verses and settings persist in localStorage)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app) builds the service worker (`src/sw.ts`), which caches the app for offline use and shows reminders from a copy of the state in IndexedDB (`src/lib/reminders.ts`); a new version waits for you to reload

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (the schedule, lists, queue, reminders, parsing, verse text)
npm run build      # static site in dist/
```

The build is a static site with no server or API keys, and its URLs are relative, so it can be hosted
under any path. Each push to `main` tests, builds, and deploys it to GitHub Pages at
[mastertemple.github.io/scripture-retention](https://mastertemple.github.io/scripture-retention/)
(`.github/workflows/deploy.yml`; turn on Pages with *GitHub Actions* as its source in the repository's settings).
