# Weekend Tutoring

A coordinator for a volunteer tutoring program: US high school students tutor
students in mainland China, one-on-one, on weekends.

It is a static site. There is no backend, no login, and no server holding
children's names, schools, or guardian contacts. Everything runs in the browser,
and the data lives in a JSON file the coordinator keeps.

**Status:** Phase 1. The shell, routing, bilingual UI, data layer, and the pure
logic modules (timezone math, pairing, hours) are built and tested. The
individual screens are scaffolded and land next.

## Running it

The app is built from ES modules, and browsers refuse to load modules from a
`file://` URL. Serve the folder:

```sh
git clone https://github.com/calebsuh625/evf.git
cd evf
python3 -m http.server 8000
```

Open <http://localhost:8000/>. Click **Load sample data** to see it populated.

Opening `index.html` by double-clicking shows a short page explaining this
rather than a blank screen.

## Deploying

GitHub Pages, from the repo root. In **Settings → Pages**, set the source to
*Deploy from a branch*, branch `main`, folder `/ (root)`. No build step and no
configuration — the paths resolve correctly under a project subpath.

## Tests

Open <http://localhost:8000/tests/test.html>. 108 unit tests covering the
timezone math, the pairing scorer, the hour computation, and the store's
migration and export logic.

They also run headless, because the logic modules are deliberately free of DOM
code:

```sh
node -e "import('./tests/runner.js').then(async ({run}) => {
  for (const f of ['time','matching','hours','store']) await import('./tests/'+f+'.test.js');
  const r = await run(e => e.type==='fail' && console.log('FAIL', e.name, e.error));
  console.log(r); process.exit(r.failed ? 1 : 0);
})"
```

## How the data works

The **exported JSON file is the source of truth.** localStorage is a convenience
cache so a half-finished session log survives a phone browser evicting the tab.

- **Export** downloads everything as one readable, diffable JSON file.
- **Import** replaces what is loaded. Files saved by older versions are migrated
  forward automatically, so an old backup keeps opening.
- **Clear this browser** wipes the cache and leaves exported files untouched.

Export regularly. That file is what makes the program survive any individual
leaving.

## Time zones

The hardest part of the program, and the reason `js/time.js` exists.

A tutor in Ohio free "Saturday 9pm" and a student in Chengdu free "Sunday 9am"
are describing the same hour. A tutor's Saturday morning is a Saturday *night*
in China. And when US clocks move for daylight saving, every pairing shifts by
an hour while China — which has one time zone and no DST — does not move at all.

So the app stores two different kinds of time and never confuses them:

- **Instants** — a session that happened. Always an ISO 8601 UTC string.
- **Recurring availability** — "Saturdays 9–11am, Eastern". Stored as a weekday,
  a wall-clock range, and a zone, then resolved into real instants against a
  specific week. Storing these as UTC would silently break twice a year.

Every conversion goes through `js/time.js`, and the DST cases have tests.

## Privacy

`data/sample.json` is entirely invented and stays that way. Every name in it is
a placeholder.

**Never commit real tutor or student data.** Real data belongs only in an export
the coordinator keeps privately.

## Layout

```
index.html          app shell and view container
css/                styles, one file per area
js/
  app.js            bootstrap, hash routing, view switching
  store.js          load, save, import, export, migrate
  time.js           timezone math      — pure functions, no DOM
  matching.js       pairing scorer     — pure functions, no DOM
  hours.js          hour computation   — pure functions, no DOM
  i18n.js           English / Simplified Chinese
  views/            one module per screen
data/sample.json    committed demo dataset
tests/              browser test runner and unit tests
CLAUDE.md           product principles and technical rules
```

The three pure modules take their data as arguments and touch no globals, so if
the program later moves to a real backend they port across unchanged.

## Design principles

Summarised from [CLAUDE.md](CLAUDE.md), which is the full version:

1. Every screen serves the person looking at it. Tutors and students are
   volunteers and kids — the app gives them something useful rather than
   extracting data from them.
2. Admin data is a byproduct, computed from things people did for their own
   reasons.
3. No penalties, no strikes, no compliance enforcement, ever.
4. Logging a session takes under 20 seconds on a phone.
5. Students and guardians never have required data entry.
6. Bilingual from day one.
7. Everything exports.
