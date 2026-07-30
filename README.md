# Weekend Tutoring

A coordinator for a volunteer tutoring program: US high school students tutor
students in mainland China, one-on-one, on weekends.

**[Live demo → calebsuh625.github.io/evf](https://calebsuh625.github.io/evf/)**

It is a static site. There is no backend, no login, and no server holding
children's names, schools, or guardian contacts. Everything runs in the browser,
and the data lives in a JSON file the coordinator keeps.

The demo loads invented data and says so, loudly, at the top of every screen.

---

## What it does

**For tutors** — the next class in both time zones with the correct weekday at
each end, the homework they set last time, a card per student, and their hours.
Logging a session is one tap from the dashboard, everything on chips, and it
completes in under twenty seconds on a phone without scrolling. Hours export as
a printable **volunteer service record** ready for a supervisor's signature —
NHS, the Congressional Award and the President's Volunteer Service Award all ask
for the same things and the printout carries all of them.

**For students and their families** — their tutor, the next class in Beijing
time with the meeting link, the current homework, and everything covered so far.
Chinese by default, with an English toggle. **There is nothing a student has to
fill in.** Guardian contact details are the one editable thing, only from the
guardian view, and every field is optional.

**For coordinators** — an overview with hours by week, month and term plus a
growth chart; a **needs-attention** screen surfacing pairings that have quietly
stopped, students with no tutor, and volunteers sitting idle; a matching engine
that explains every suggestion in plain language; a filterable roster with
inline editing; and one-click backup.

## Product principles

The seven principles this is built on are in **[CLAUDE.md](CLAUDE.md)**, with
the reasoning and the technical rules that follow from them. In short:

1. Every screen serves the person looking at it.
2. Admin data is a byproduct, computed from things people did for their own reasons.
3. No penalties, no strikes, no compliance enforcement, ever.
4. Logging a session takes under 20 seconds on a phone.
5. Students and guardians never have required data entry.
6. Bilingual from day one.
7. Everything exports.

CLAUDE.md also records what this will **never** have — strike tracking,
suspensions, compliance dashboards, automated nagging — and why. Read that
before agreeing to add any of them.

## Never commit real data

`data/sample.json` is entirely invented and stays that way. Every name pairs an
ordinary given name with a Greek-letter surname so it cannot be mistaken for a
real person, and every address uses the IANA-reserved `example.org` domain.

**Real tutor and student data must never enter this repository.** Not in
`data/`, not in a test fixture, not pasted into an issue or a pull request, not
in a screenshot. These are minors. The real records live in one JSON file the
coordinator keeps privately — see [HANDOVER.md](HANDOVER.md).

This is not a nice-to-have. It is the reason the app has no backend: there is no
database of children's names and guardian contacts to leak, and committing a
real export would undo that in one keystroke.

## Running it locally

The app is built from ES modules, and browsers refuse to load modules from a
`file://` URL. Serve the folder:

```sh
git clone https://github.com/calebsuh625/evf.git
cd evf
python3 -m http.server 8000
```

Open <http://localhost:8000/>. Double-clicking `index.html` shows a short page
explaining why that cannot work rather than a blank screen.

There is **no build step and nothing to install** to run or deploy the app.
`package.json` exists only so CI can drive a headless browser.

## Loading and exporting data

The **exported JSON file is the source of truth.** localStorage is a convenience
cache, so a half-finished session log survives a phone browser evicting the tab.

Everything is on **Export** (`#/admin/export`):

- **Download backup** — everything as one dated JSON file. It restores
  completely and is the only file anyone needs to keep.
- **Restore** — drop a backup in. Files saved by older versions are migrated
  forward automatically, so a file from last term still opens. A malformed file
  is refused with a list of exactly what is wrong, and nothing changes.
- **Spreadsheets** — CSV for roster, availability, pairings and sessions, which
  re-import; plus hours-by-tutor and a session report, which are derived and so
  are export-only.
- **Load sample data** — the demo dataset, for showing somebody the app.

Export regularly. That file is what makes the program survive any individual
leaving.

## Deploying

GitHub Pages from the repo root: **Settings → Pages → Deploy from a branch →
`main` → `/ (root)`**. Already configured, so pushes to `main` publish
automatically. No build step and no configuration — paths resolve correctly
under the `/evf/` project subpath.

## Tests

[![tests](https://github.com/calebsuh625/evf/actions/workflows/tests.yml/badge.svg)](https://github.com/calebsuh625/evf/actions/workflows/tests.yml)

**477 tests.** Every push and pull request runs them and fails on a regression.

In a browser: open <http://localhost:8000/tests/test.html>.

Headless:

```sh
node tests/run-node.mjs                              # 446 tests, nothing to install
npm install && npx playwright install chromium
node tests/run-browser.mjs http://localhost:8000     # all 477
```

The Node run needs nothing installed, because the logic modules are deliberately
free of DOM code. Eleven tests genuinely need a browser — colour contrast read
from the live stylesheet, accessible names from the rendered DOM, asset
provenance from Resource Timing — and they report as **skipped** in Node rather
than passing quietly. CI runs both, treats a bare console error as a failure,
and separately checks that no external URL has crept into a shipped file.

There is also a **[time zone self-test](https://calebsuh625.github.io/evf/#/selftest)**
built into the app: it runs the timezone assertions in your own browser and
shows them passing, in plain language, in either language. The timezone maths is
the part most likely to be wrong, so it is the part you can check without
reading any code.

## Accessibility, weight and polish

Checked by tests rather than asserted:

- **WCAG AA contrast** in light and dark. The suite parses the real stylesheet
  and fails if any text pair drops below 4.5:1.
- **Keyboard throughout**, with a visible focus ring. A test fails the build if
  any rule sets `outline: none` on `:focus`.
- **Named controls.** Every button, field and select has an accessible name, and
  no two chips in the logging form share one — they read as "Prep 15 min", not
  "15".
- **44px touch targets** on any coarse pointer.
- **Every date carries its time zone**, because the same instant is a different
  day at each end of this program.
- **No external requests at all**, verified from the browser's own resource
  timings rather than from reading the source.

First visit is about **126 KB gzipped**. Views load on demand, so a student on a
phone downloads 9 modules rather than 28 and never fetches the admin screens or
the matcher. No images, no web fonts.

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

Both US daylight-saving transitions fall on a Sunday, which is a tutoring day.
One of those Sundays has a local 02:00–03:00 that does not exist, and the other
has a 01:00–02:00 that happens twice. Both are detected and resolved
deliberately — forward past the gap, and to the first of the two repeats.

## Matching

Schedule overlap is a hard requirement: fifteen hours apart, a pair with no
shared window has no session to have, so it is never suggested however well they
fit otherwise. Beyond that the scorer weighs subject fit, English level, shared
interests, and how loaded each tutor already is, so students spread across
volunteers instead of piling onto whoever fits best.

**Every suggestion explains itself**, in either language:

> 3 shared hours, Saturday morning Beijing time (08:00–11:00) · Both listed
> english conversation · Tutor is comfortable at intermediate level · Both
> interested in k-pop · Tutor has 1 of 2 places open
>
> *Worth knowing:* Only one shared window — fragile if either has to cancel ·
> This is the tutor's last place

A score is never shown without that reasoning. **The system suggests; a human
accepts.** Nothing is ever paired automatically.

## Continuity

The program has to survive any individual leaving, including whoever built it.

Handing it over is two things: the JSON backup and this URL. Whoever takes over
loads the file and has everything — no account to transfer, no password to hand
on, no server anybody has to keep paying for. Backup, wipe and restore is
covered by a test asserting the restored program is identical.

Start here: **[HANDOVER.md](HANDOVER.md)**.

## Layout

```
index.html          app shell, sample-data banner, file:// guard
css/                base (reset + tokens) · layout · components · views · tutor · print
js/
  app.js            bootstrap, hash routing, lazy view loading, role picker
  store.js          data model, load/save, import/export, migrations
  time.js           timezone math       — pure functions, no DOM
  matching.js       pairing scorer      — pure functions, no DOM
  hours.js          hour computation    — pure functions, no DOM
  tutor.js          tutor-facing views  — pure functions, no DOM
  admin.js          coordinator figures — pure functions, no DOM
  chart.js          chart geometry      — pure functions, no DOM
  csv.js            CSV parse/write     — pure functions, no DOM
  selftest.js       the timezone assertions, as runnable scenarios
  i18n.js           English / Simplified Chinese
  views/            one module per screen, loaded on demand
data/sample.json    committed demo dataset — synthetic only
tests/              browser runner, headless runners, unit tests
CLAUDE.md           product principles and technical rules
HANDOVER.md         for the next coordinator
```

The pure modules take their data as arguments and touch no globals, so if the
program later moves to a real backend they port across unchanged.
