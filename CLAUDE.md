# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A volunteer tutoring coordinator. US-based high school tutors teach students in
mainland China, one-on-one, on weekends. Static site, no backend, no accounts.
Runs entirely in the browser; the data lives in a JSON file the admin owns.

There is no server holding minors' names, schools, or guardian contacts. That is
a feature of the design, not a limitation of it.

## PRODUCT PRINCIPLES

1. **Every screen serves the person looking at it.** Tutors and students are
   volunteers and kids — the app gives them something useful, it does not
   extract data from them.
2. **Admin data is a byproduct**, computed from things people did for their own
   reasons.
3. **No penalties, no strikes, no compliance enforcement, ever.** If a feature's
   justification is "so people will comply," it does not get built.
4. **Logging a session must take under 20 seconds on a phone.**
5. **Students and guardians never have required data entry.**
6. **Bilingual (English / Simplified Chinese) from day one.**
7. **Everything exports.** The program survives any individual leaving.

## TECHNICAL RULES

- Pure logic (time, matching, hours) stays free of DOM code so it ports to a
  backend later without rewriting.
- All timestamps stored as ISO 8601 UTC strings. Never store naive local times.
- Every timezone conversion goes through `js/time.js`.
- The JSON export is the source of truth. localStorage is a convenience cache.
- NEVER commit real names or contact details. Sample data only.
- Data model changes must include a migration in `store.js` and a version bump.

## Constraints

- Static site: HTML, CSS, vanilla JS with ES modules. **No build step, no
  framework, no bundler.** Must run correctly served as plain files.
- Deployed via GitHub Pages from the repo root.
- No backend, no external API calls, no analytics, **no CDN dependencies**.
  Anything fetched from outside the repo can fail from mainland China, so
  nothing is. No web fonts — system font stack only.
- All state in memory, persisted to localStorage, with explicit JSON
  import/export as the real save mechanism.

## Layout

```
index.html          app shell, view container, file:// boot guard
css/                base (reset + tokens) · layout (shell) · components · views
js/
  app.js            bootstrap, hash routing, view switching
  store.js          data layer: load, save, import, export, migrate
  time.js           timezone math       — pure, no DOM
  matching.js       pairing scorer      — pure, no DOM
  hours.js          hour computation    — pure, no DOM
  i18n.js           en / zh-Hans dictionary
  dom.js            small shared DOM helpers (not a framework — keep it small)
  views/            one module per screen, each exporting render(container, ctx)
data/sample.json    committed demo dataset — synthetic only
tests/test.html     browser test runner
tests/*.test.js     unit tests for time, matching, hours, store
```

## Running it

ES modules do not load over `file://` — browsers block it. Serve the folder:

```
python3 -m http.server 8000   # then open http://localhost:8000/
```

`index.html` carries a small classic-script guard that detects the `file://`
case and explains it rather than showing a blank page. On GitHub Pages the site
is served over HTTP, so it just works.

Tests: open `tests/test.html` over the same server. They also run headless:

```
node -e "import('./tests/runner.js').then(async ({run}) => {
  for (const f of ['time','matching','hours','store']) await import('./tests/'+f+'.test.js');
  const r = await run(e => e.type==='fail' && console.log('FAIL', e.name, e.error));
  console.log(r); process.exit(r.failed ? 1 : 0);
})"
```

The pure modules import cleanly in Node, which is the point of keeping them
DOM-free — see the first technical rule.

## Conventions that matter

**Two kinds of time, and they are not the same.** Instants (a session happened)
are ISO 8601 UTC strings. Recurring wall times (a tutor is free Saturdays at
9am) are `{ day, start, end, tz }` and must NOT be stored as UTC — 9am Shanghai
is a different UTC time depending on whether the US side is in DST. `time.js`
resolves the second kind into the first against a reference week. Read the
header comment there before touching any of it.

**Weekday numbering is 0 = Sunday**, matching `Date#getUTCDay`.

**The availability week wraps.** A tutor's Saturday evening in New York is a
Sunday morning in Shanghai, which is a different day *and* a different week
depending on the anchor. `availabilityOverlapMinutes` tests ±7-day shifts for
exactly this reason. Removing that breaks the single most common slot in the
program; there is a test pinning it.

**Views never format a date themselves.** Import from `time.js`. A view that
calls `Intl.DateTimeFormat` directly is a bug.

**Views never hardcode UI copy.** Add a key to `js/i18n.js` in both languages.
A missing key logs a warning and falls back to English. English-only text is
text a student's parent cannot read.

**`el()` in `dom.js` sets `textContent`, never `innerHTML`.** Session notes are
typed by a volunteer on a phone and rendered on a coordinator's screen. Keep
that path incapable of producing markup.

**Session status is `held` | `canceled`.** A cancellation is a neutral fact
about a calendar. It is counted separately and never subtracted from anything.
Do not add a "no-show", an attendance grade, or a required reason field — see
principle 3.

**Only `held` sessions contribute hours.** Hours are derived in `hours.js` from
session records. Nobody types an hour figure. If a tutor never opens the Hours
screen, their hours are still correct.

**Month boundaries for hours are decided in the tutor's own time zone.** A
session at 9pm on March 31 in New York is April 1 in UTC and a March session on
a US hour form.

## Adding a screen

1. Add `js/views/<name>.js` exporting `render(container, { params, navigate, store })`.
2. Import it in `js/app.js` and add a row to the `ROUTES` table.
3. Add its nav label to both dictionaries in `js/i18n.js`.

Routing is hash-based (`#/matches`) because GitHub Pages has no rewrite rules —
`/matches` would 404 on a hard refresh.

## Changing the data model

1. Write a migration keyed by the version you are migrating **from** in the
   `MIGRATIONS` object in `store.js`.
2. Bump `SCHEMA_VERSION`.
3. Add a test in `tests/store.test.js` that migrates a fixture of the old shape.
4. **Never edit a shipped migration.** Add the next one.

Old exports must keep opening. A coordinator's backup from last spring is the
program's memory.

## Privacy

`data/sample.json` is synthetic and stays synthetic. Every name in it is a
placeholder. Real tutor and student data lives only in an export the coordinator
keeps privately, and must never be committed, pasted into an issue, or included
in a test fixture.

`store.test.js` deliberately does not call `importJson()` or `replaceState()`:
they write to the same localStorage key the real app uses, so a coordinator who
opened the test page would find their program replaced by fixtures.

## Phase 2

If the club replaces the current tool, the storage layer behind `store.js`
swaps for a real backend. `time.js`, `matching.js`, and `hours.js` move across
unchanged — that is why they take their data as arguments and touch no globals.
Keep it that way.
