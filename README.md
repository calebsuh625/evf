# Weekend Tutoring

A coordinator for a volunteer tutoring program: US high school students tutor
students in mainland China, one-on-one, on weekends.

It is a static site. There is no backend, no login, and no server holding
children's names, schools, or guardian contacts. Everything runs in the browser,
and the data lives in a JSON file the coordinator keeps.

**Status:** The tutor-facing side is built — dashboard, session logging, hours
with a printable verification record, student pages, and availability. The
coordinator screens are still scaffolded.

There is no login yet: a picker at the top right chooses whether you are
looking as the coordinator or as a particular tutor, and it remembers.

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

Open <http://localhost:8000/tests/test.html>. 346 unit tests covering the
timezone math, the pairing scorer, the hour computation, CSV handling, the
tutor-facing selectors, the bilingual dictionary, and the store's migration,
validation and export logic.

There is also a **[time zone self-test](#/selftest)** built into the app itself
— open the running site and follow the link in the footer. It runs the timezone
assertions in your browser and shows them passing or failing, in plain language,
in English or Chinese. The timezone math is the part of this app most likely to
be wrong, so it is the part you can check without reading any code.

They also run headless, because the logic modules are deliberately free of DOM
code:

```sh
node -e "import('./tests/runner.js').then(async ({run}) => {
  for (const f of ['time','matching','hours','csv','store','tutor','i18n']) await import('./tests/'+f+'.test.js');
  const r = await run(e => e.type==='fail' && console.log('FAIL', e.name, e.error));
  console.log(r); process.exit(r.failed ? 1 : 0);
})"
```

## How the data works

The **exported JSON file is the source of truth.** localStorage is a convenience
cache so a half-finished session log survives a phone browser evicting the tab.

- **Export** downloads everything as one readable, diffable JSON file.
- **Import** replaces what is loaded. Files saved by older versions are migrated
  forward automatically, so an old backup keeps opening. A malformed file is
  refused with a list of exactly what is wrong, and nothing changes.
- **Spreadsheets** import a roster from CSV and export any table as CSV. An
  import adds and updates rows; it never deletes.
- **Clear this browser** wipes the cache and leaves exported files untouched.

Export regularly. That file is what makes the program survive any individual
leaving.

### The document

One versioned JSON document with four tables: `people` (tutors and students
together, with a `role`), `pairings`, `sessions`, and `availability`. Sessions
belong to a pairing rather than to a tutor and student directly, because the
pairing is the thing that persists over time. See [CLAUDE.md](CLAUDE.md) for the
field-by-field shape and the reasoning.

## For tutors

The tutor screens are the ones that have to earn their keep, because the
program only works if volunteers want to come back.

- **Dashboard** — the next class in both time zones with the correct weekday
  at each end, the homework you set last time, what you covered, a card per
  student, and your hours. Classes you have not written up appear as a quiet
  list: no counter, no streak, no deadline.
- **Log a session** — one tap from the dashboard, pre-filled, everything on
  chips. Built to complete in under twenty seconds on a phone without
  scrolling, which is measured rather than assumed.
- **My hours** — totals by term and all-time, split into teaching, prep and
  follow-up, with every session listed. Exports as CSV, and prints as a
  **volunteer service record** ready for a supervisor's signature: NHS, the
  Congressional Award, and the President's Volunteer Service Award all ask for
  the same things and the printout carries all of them.
- **Student page** — the full session history, written so that a tutor taking
  over can read it and know where to pick up.
- **Availability** — recurring weekend windows in your own clock, echoed in
  Beijing time, plus a plain "not taking new students right now" switch.

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

Every conversion goes through `js/time.js`. The two core calls are
`toUtc(localIso, tz)` and `fromUtc(utcIso, tz)`; passing a `Z`-suffixed instant
where a local wall clock belongs is an error rather than a guess.

Both US daylight-saving transitions fall on a Sunday, which is a tutoring day.
One of those Sundays has a local 02:00–03:00 that does not exist, and the other
has a 01:00–02:00 that happens twice. Both cases are detected and resolved
deliberately — forward past the gap, and to the first of the two repeats — and
both have tests and a visible check in the self-test panel.

## Privacy

`data/sample.json` is entirely invented and stays that way. Every name pairs an
ordinary given name with a Greek-letter surname so it cannot be mistaken for a
real person, and every address uses the reserved `example.org` domain.

The dataset is deliberately awkward, because a demo that only shows the happy
path teaches nothing: it includes 12 tutors, 20 students, 15 active pairings and
three months of session history, plus a pairing that has gone quiet for over a
month, five tutors at the maximum they set for themselves, a student no tutor
can currently take, a pairing whose shared hour falls on different calendar days
at each end, two students who fit the same single-slot tutor, a tutor in Arizona
who never changes clocks, and students whose availability crosses local
midnight.

**Never commit real tutor or student data.** Real data belongs only in an export
the coordinator keeps privately.

## Layout

```
index.html          app shell and view container
css/                styles, one file per area
js/
  app.js            bootstrap, hash routing, view switching
  store.js          data model, load, save, import, export, migrate
  time.js           timezone math      — pure functions, no DOM
  matching.js       pairing scorer     — pure functions, no DOM
  hours.js          hour computation   — pure functions, no DOM
  csv.js            CSV parse/write    — pure functions, no DOM
  tutor.js          tutor-facing views — pure functions, no DOM
  selftest.js       the timezone assertions, as runnable scenarios
  i18n.js           English / Simplified Chinese
  views/            one module per screen
data/sample.json    committed demo dataset
tests/              browser test runner and unit tests
CLAUDE.md           product principles and technical rules
```

The four pure modules take their data as arguments and touch no globals, so if
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
