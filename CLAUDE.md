# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A volunteer **English** tutoring coordinator. **California** high school tutors
teach English to students in mainland China, one-on-one, on weekends.

The program is called **PeerBridges 2.0**. Every tutor is on Pacific time and
every student on Beijing time; those are the only two clocks in the program.

**The program teaches English and only English.** A tutor's `subjects` and a
student's `goals` both draw on `ENGLISH_SKILLS` in `store.js` — conversation,
reading, writing, grammar, pronunciation, vocabulary, listening, exam prep,
presentation skills. Free text is still accepted, because a student who asks
for something not on the list has told you something useful; the matcher simply
finds no keyword match and says so. Do not reintroduce academic subjects.

Static site, no backend, no accounts. Runs entirely in the browser; the data
lives in a JSON file the admin owns.

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
  store.js          data model + data layer: load, save, import, export, migrate
  time.js           timezone math       — pure, no DOM
  matching.js       pairing scorer      — pure, no DOM
  chat.js           class threads       — pure, no DOM
  hours.js          hour computation    — pure, no DOM
  csv.js            CSV parse/serialise — pure, no DOM
  tutor.js          tutor-facing selectors — pure, no DOM
  admin.js          coordinator's computed figures — pure, no DOM
  chart.js          line-chart geometry — pure, no DOM
  selftest.js       timezone assertions as runnable scenarios
  i18n.js           en / zh-Hans dictionary
  dom.js            small shared DOM helpers (not a framework — keep it small)
  views/            one module per screen, each exporting render(container, ctx)
css/print.css       the volunteer-hour verification record (media="print")
data/sample.json    committed demo dataset — synthetic only
tests/test.html     browser test runner
tests/*.test.js     unit tests: time, matching, hours, csv, store, chat,
                    tutor, admin, i18n, assets, a11y
```

## The data model

One versioned JSON document. Current version is **6**.

```
{
  version: 6,
  program:      { name, adminTimeZone, studentTimeZone, defaultSessionMinutes,
                  sampleData, terms },
  people:       [{ id, role: 'tutor'|'student', name, preferredName, email,
                   wechat, timezone, locale, active, createdAt, ...roleFields }],
  pairings:     [{ id, tutorId, studentId, status: 'active'|'paused'|'ended',
                   startedAt, endedAt, notes }],
  sessions:     [{ id, pairingId, scheduledAt, occurred, durationMinutes,
                   prepMinutes, followupMinutes, covered, homework, loggedAt }],
  availability: [{ personId, weekday, startTime, endTime, timezone }],
  messages:     [{ id, pairingId, authorId, authorRole: 'tutor'|'student'|
                   'guardian'|'admin', body, sentAt, deletedAt, deletedBy }]
}
```

Tutor fields: `school`, `grade`, `subjects[]`, `levelsComfortable[]`,
`maxStudents`, `bio`, `meetingLink`.

Student fields: `grade`, `englishLevel`, `goals[]`, `interests[]`,
`guardianName`, `guardianWechat`, `guardianEmail`.

Three shape decisions worth not re-litigating:

**Tutors and students are one table with a `role` discriminator.** They share
most fields, every "people" screen wants both, and a tutor who later helps
coordinate should not need a second row.

**Sessions hang off `pairingId`, never off a tutor and student directly.** The
pairing is the thing that persists; a session is one instance of it. So
resolving a session to its people goes through the pairing, which is why
`hours.js` takes the pairings table as an argument. Denormalising a `tutorId`
back onto sessions would create two sources of truth that can disagree.

**Availability is its own table.** It is queried by time far more than
per-person, rows come and go independently of the person, and a nested array
makes bulk CSV import awkward.

**A student's `goals` are a tutor's `subjects`.** The matcher intersects those
two fields. They are named differently because they mean different things from
each side; do not "fix" this by renaming one.

**`occurred` is a boolean, not a status string.** Did it happen, yes or no.
There is deliberately no "no-show", no attendance grade, and no required
reason field — see principle 3.

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
  for (const f of ['time','matching','hours','csv','store','i18n']) await import('./tests/'+f+'.test.js');
  const r = await run(e => e.type==='fail' && console.log('FAIL', e.name, e.error));
  console.log(r); process.exit(r.failed ? 1 : 0);
})"
```

The pure modules import cleanly in Node, which is the point of keeping them
DOM-free — see the first technical rule.

## Conventions that matter

**Two kinds of time, and they are not the same.** Instants (a session happened)
are ISO 8601 UTC strings. Recurring wall times (a tutor is free Saturdays at
9am) are `{ weekday, startTime, endTime, timezone }` and must NOT be stored as
UTC — 9am Shanghai is a different UTC time depending on whether the US side is
in DST. `time.js` resolves the second kind into the first against a reference
week. Read the header comment there before touching any of it.

**The core conversions are `toUtc(localIso, tz)` and `fromUtc(utcIso, tz)`.**
`toUtc` takes a *naive* wall clock — "2026-06-20T09:00", no `Z`, no offset —
and throws if given one that carries a zone, because that string is an instant
and treating it as a local time is the bug this module exists to prevent.
`fromUtc` returns a wall clock with no suffix, for the same reason.

**`resolveLocal` classifies every local time as normal, ambiguous or
nonexistent**, by bracketing the naive target with the offsets in force a day
either side and checking which candidates read back. Ambiguous (the fall-back
hour, which happens twice) resolves to the FIRST occurrence and reports the
other. Nonexistent (the spring-forward gap) resolves FORWARD past the gap —
never backward, because backward moves a booked session an hour *earlier*,
which is the direction that makes someone miss it.

**Both US transitions land on a Sunday**, which is a tutoring day. That is not
a hypothetical edge case here.

**`formatDual(utc, tzA, tzB)` computes each side's weekday from a formatter
bound to that one zone.** Never derive one side's weekday from the other's, and
never offset-adjust a weekday: Saturday 09:00 in Beijing is *Friday* 18:00 in
California, so the two sides routinely disagree. There is a scenario pinning
this, and injecting a shared weekday makes it fail.

**Weekday numbering is 0 = Sunday**, matching `Date#getUTCDay`.

**Availability rows are `{ weekday, startTime, endTime, timezone }`** — a wall
clock plus a zone, never normalised to UTC. `startTime` after `endTime` means
the window crosses local midnight, which real students do use.

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

**Never call `node.append()` or `node.replaceChildren()` with a child that
might be null — use `mount()` from `dom.js`.** Native `append` stringifies
whatever it is given, so `container.append(cond ? panel : null)` writes the
literal word "null" onto the page. That has reached users twice: once as
"Total 60 minnull", once as a bare "null" on the accounts screen. `el()` and
`mount()` filter; the natives do not. `tests/a11y.test.js` sweeps every screen
for stray `null`, `undefined`, `NaN` and `[object Object]`.

That sweep is also a lesson in writing the assertion wrong: the first version
matched `/\bnull\b/`, which cannot catch three nulls in a row — "nullnullnull"
has no word boundary between the repeats — and it passed against the real bug.
It now matches plain substrings, which is safe because no string in either
dictionary contains those words. When adding a check like this, reintroduce
the bug and watch it fail before believing it.

**`el()` in `dom.js` sets `textContent`, never `innerHTML`.** Session notes are
typed by a volunteer on a phone and rendered on a coordinator's screen. Keep
that path incapable of producing markup.

**A session that did not happen is a neutral fact about a calendar.** It is
counted separately and never subtracted from anything. Do not add a "no-show",
an attendance grade, or a required reason field — see principle 3.

**`pairingsNeedingCheckIn()` is a support tool, not an enforcement one.** It
surfaces pairings that have gone quiet so a coordinator can ask whether someone
is stuck. It takes an explicit `asOfIso` so the answer is reproducible, stores
no count against any person, and must never be shown to a tutor as a warning.

**Only sessions with `occurred === true` contribute hours.** Hours are derived
in `hours.js` from session records. Nobody types an hour figure. If a tutor
never opens the Hours screen, their hours are still correct.

**Every class held is credited a flat two hours** (`SESSION_CREDIT_MINUTES` in
`hours.js`), whatever the clock said. That is the program's standard block: the
class, the preparation before it and the notes after it. A tutor whose student
got it in twenty minutes gave the same slot of their Saturday as one who ran
ninety, and neither is asked to itemise it.

**The log form therefore does not ask how long anything took.** No duration,
prep or follow-up chips. Asking for minutes that change no total would be
collecting data for its own sake (principle 2). Logging is one tap plus
whatever the tutor chooses to type.

**The printed record states the basis on its face**, and this is not optional.
It is signed by an adult for NHS, the Congressional Award and the President's
Volunteer Service Award, so it says "N classes × 2 hours" and says plainly that
individual class lengths are not separately measured. A record showing two
hours while implying two hours were measured would ask somebody to attest to
something nobody checked. Never remove that line.

`contactMinutes` survives as the recorded class time for historical rows and
CSV columns. It deliberately does **not** add up to the total any more; the
total is a count times a rate.

**Month boundaries for hours are decided in the tutor's own time zone.** A
session at 9pm on March 31 in New York is April 1 in UTC and a March session on
a US hour form.

## The store API

```
load() save() reset()                   localStorage cache (save is debounced)
exportJson() importJson(file)           the real save mechanism
exportCsv(type) importCsv(file, type)   spreadsheets; type is one of CSV_TYPES
migrate(data) validate(data)            called on every load and import
parseProgramJson(text)                  parse + validate without touching state
parseCsvText(type, text)                same, for CSV
toJson(data) toCsvText(type, data)      serialise without downloading

activePairingsFor(personId)   sessionsFor(pairingId)
unpairedStudents()            tutorsWithCapacity()
tutors() students() personById() availabilityFor() sessionsForPerson()
summary()                     counts for the dashboard, in one pass
```

Every query helper takes an optional trailing `data` argument defaulting to live
state, so views call `store.summary()` and tests call `store.summary(fixture)`.

`unpairedStudents()` counts a **paused** pairing as unpaired: somebody has to
pick it back up. `tutorsWithCapacity()` respects each tutor's own `maxStudents`
as a limit they set for themselves, not a target to fill.

## The tutor screens

`#/tutor`, `#/tutor/hours`, `#/tutor/availability`, `#/tutor/log/:pairingId`
and `#/tutor/student/:studentId`. Everything a tutor reads or writes.

**These have to be worth opening.** The whole program depends on volunteers
choosing to come back, so every element on the dashboard is something the
tutor wants — the next class in both clocks, the homework they set last time,
what they covered — and the coordinator's numbers fall out of that as a
byproduct (principles 1 and 2). Nothing on these screens exists to collect
data.

**The nudge is a list, never a counter.** `outstandingLogs()` returns rows and
nothing else: no count, no streak, no deadline, no red badge. There is a test
asserting the returned shape has exactly `session`, `pairing` and `student`,
because the moment it grows a number somebody will render it as a score.

**Logging a session has a hard budget**: under twenty seconds, thumb only, no
scrolling, on a phone as small as 375x667. That is measured, not assumed —
everything is a chip, every value is pre-filled from the scheduled session so
the common case is one tap on Save, "No" collapses the rest of the form, and
on small screens the header and footer stand down so the Save button clears
the fold. Changing the spacing on that screen means re-measuring it.

**There is no longer an hours cap**, because there is nothing to cap: a class
is worth two hours or nothing. `clampRecordedMinutes` only keeps a stored
number believable (`MAX_RECORDED_MINUTES`) so a slipped thumb on a CSV import
cannot put "600 minutes" in a student's history.

**`#/tutor/student/:id` is written for handover.** The session history is the
body of the page, not an appendix, because when a tutor leaves the only
honest answer to "where do I pick this up" is what was actually covered and
what homework was set.

**The admin time zone is fixed to California** (`PROGRAM_TIME_ZONE`), not
guessed from the browser. A coordinator travelling, or opening the app on a
school machine set to UTC, must not silently reinterpret every date in the
program. It is also the default for a newly added tutor, who can change it.

**Availability is a recruiting tool, not a rota.** It only matters when a
tutor wants another student, and `acceptingStudents` is separate from
`active`: a tutor with a full plate is still very much active. Turning the
toggle off changes nothing else.

## The student and guardian screens

`#/student`, for the student or whoever is holding their phone.

**Core rule: they never have required data entry.** They are being served, not
managed. There is no form a student must complete, no profile to maintain, no
attendance to confirm, nothing that nags. A test asserts the student view
contains **zero** editable controls and zero `required` attributes; if that
ever fails, something has been added that should not exist.

**Deliberately not built**, and not to be added without a very good reason:
browsing and booking tutors from a list, cancellation flows, penalties,
required forms, ratings.

**Chinese by default for these roles.** `defaultLangFor(role)` returns `zh` for
a student or guardian. An explicit choice via the toggle always wins and is
remembered — `hasExplicitLang()` is the difference between "nobody has said"
and "somebody chose English".

**A guardian is not a record.** They are whoever is holding the phone, so
`viewAs` carries `guardian:<studentId>` rather than there being a guardian
person to register. Modelling them properly would mean asking a family to sign
up before they can read their own child's homework.

**Guardian contact fields are editable only from the guardian view**, every
field is optional, and **blank is a complete answer** — clearing a field and
saving must work, and there is a test for it.

**Built for a phone on a slow connection.** No images, no icon font, nothing
fetched from anywhere. The session history renders a page at a time rather
than a year of classes nobody scrolled to.

## No external assets, ever

The students are in mainland China. A CDN that is slow, blocked, or simply
unreachable from there does not degrade this app, it breaks it — for exactly
the people least able to work around it.

`tests/assets.test.js` checks what the browser **actually fetched**, via
Resource Timing, rather than reading the source and hoping the source is the
whole story: every resource same-origin, no off-origin `link`/`script`/`img`,
and no `@font-face` pointing outside the origin. It only runs in a browser and
reports as **skipped** in Node rather than passing vacuously.

## Accounts and sign-in

`js/auth.js`, `#/sign-in`, `#/admin/accounts`. Schema v7 adds `accounts`.

**This is not a security boundary and must never be described as one.** The
whole program is in the reader's browser; anyone who opens developer tools can
read every record, change their own role, or delete the accounts table. What
sign-in buys is identity (work attaches to a person rather than to whichever
role the picker was left on), a credential store shaped the way a server would
store it, and a shoulder-surfing barrier on a shared device. `auth.notSecurity`
says exactly this, in both languages, on the sign-in screen and again on the
coordinator's screen. Do not soften that copy.

**A program with no accounts stays open.** `needsSignIn` is false when
`accounts` is empty, and the 6 → 7 migration creates nobody. A coordinator who
never set sign-in up must keep full access to their own records after any
update; locking them out would be the worst bug this codebase could ship,
because the records *are* the program. There is a test for it.

**There are two ways in, and principle 5 needs both.** The coordinator can
hand somebody access — a username and a short code, read out, nothing for the
family to invent or remember. Or somebody signs themselves up at `#/sign-up`,
which is what stops a coordinator reading out twelve codes in a week. Self
sign-up is an **addition**; the moment it becomes the only way in, principle 5
is broken.

**A self-created account is pending, and pending sees one screen.** No roster,
no students, no contact details, no messages — the router checks
`sessionIsPending()` before any route loads, so this is not enforced screen by
screen. It is the entire safeguard for open sign-up, and it has to be: with no
server there is no way to check that somebody claiming to be a tutor is that
tutor. A coordinator says which person on the roster they are, and only then
does anything open. `approveAccount` refuses to point a tutor account at a
student record.

`isPending` treats a null `personId` as pending regardless of `status`, so one
bad hand-edit to a JSON file cannot open an account onto somebody else's data.
Nobody can sign themselves up as a coordinator. `describeSecretProblem` holds
tutors and coordinators to a length rule and holds families to nothing beyond
the code. `generateAccessCode` uses no vowels and no O/0/I/1/l, so a code can
neither spell anything nor be misheard down a phone line.

**A code is shown once, in a dialog, and never again.** It is hashed like any
password, so it genuinely cannot be recovered — only reissued. The dialog does
not time out, because somebody is copying it into WeChat.

**PBKDF2-SHA-256, salted per account, iterations stored per account.** Not
because a local app needs it, but because the accounts table travels inside
the export — the file a coordinator emails their successor — and teenagers
reuse passwords. Storing the iteration count per row means the cost can be
raised later without invalidating everybody's password.

**Sign-in failures never say which half was wrong.** Distinguishing an unknown
username from a bad password tells anyone holding a copy of the file which
accounts are real.

**`viewAsFor` maps an account onto the existing viewAs model** — 'admin', a
person id, or `guardian:<studentId>` — so accounts are additive and every
screen, route and read-state key already built keeps working unchanged.

## The role picker

There is no auth. `viewAs` is 'admin' or a person id in localStorage, and it
is deliberately stored apart from program data — it is a fact about this
browser, not about the program, and it must never travel inside an export.

The picker is replaced by a name and a **Sign out** button once somebody is
signed in: swapping role at will would make the account meaningless. It stays
in full for a program with no accounts, which is the only way to look around
the demo.

**`route.role` is navigation, not security.** It decides which screens make
sense for the selected person. Nothing in this app is a permission check and
none of it should ever be mistaken for one.

## The hours export

The feature that makes logging worth doing. A high schooler logs sessions
because at the end of the year they need a signed sheet, so the printed record
is treated as the point of the hours screen rather than a button in a corner.

It renders into the page and is revealed by `css/print.css`, so `window.print()`
needs no popup and there is no second code path that could disagree with what
is on screen. NHS, the Congressional Award and the President's Volunteer
Service Award all want the same things and the record carries all of them:
volunteer, organisation, activity, period, hours split into teaching / prep /
follow-up, the sessions behind the total, and signature lines.

Print rules force black text — the on-screen component styles put table
headers in a grey that prints almost invisibly.

## Matching

`js/matching.js` and `#/admin/matching`. The hard problem the product exists
to solve.

**Schedule overlap is a hard requirement.** Zero shared time is not a low
score, it is not a pairing, and nothing else can compensate — there is no
session to have. A test pins a pair that matches on subject, level, interests
and language and is still excluded for having no time.

**A score is never surfaced without its reasoning.** Every candidate carries
`reasons` (why this pair) and `weaknesses` (what is fragile about it). The
number exists to order the list; the sentences are what a coordinator reads
and repeats to a parent. A test walks every eligible pair and fails if any
explains nothing.

**Reasoning is `{ code, values }`, never English sentences.** That keeps the
module free of UI copy so the same explanation renders in Chinese, and it
makes the tests assert facts rather than wording. The view translates, and
translates the weekday and part-of-day inside the values too, so nothing comes
out half-rendered.

**The load-balancing term has to be re-scored as it assigns.** `suggestPairings`
runs one assignment per round and re-ranks in between. Ranking once and walking
the list looks equivalent and is not: the balance term would be computed
against the starting load and never see the load it was itself creating, so
every student would land on whichever tutor scored best and the balancing would
silently do nothing. There is a test asserting three students across two tutors
come out 2/1 rather than 3/0.

**Redundant blockers must not double-count.** A tutor who is both full and not
accepting has two blockers but one problem, and counting them separately made
a near-miss look further away than a tutor who simply teaches the wrong
subject. `BLOCKER_CATEGORY` collapses them for the "closest candidate" ranking.

**The system suggests; a human accepts.** Nothing auto-assigns, there is no
"accept all", and `matchingReport` is asserted not to mutate the pairings
table. Pairings are created only by `store.createPairing`, called from a click.

Three things the screen surfaces beyond the suggestions, because a coordinator
will not think to look for them: students nobody can take (with the specific
fix), volunteers with capacity and no viable student (an unused volunteer does
not complain, they drift away), and active pairings whose availability has
drifted apart (nobody will mention it).

## The admin screens

`#/admin`, `#/admin/attention`, `#/admin/matching`, `#/admin/roster`,
`#/admin/export`.

**Rule: everything on these screens is computed.** No admin screen may be
populated by asking somebody to fill something in. Every figure is derived
from records people keep for their own reasons — a tutor logging a class so
they remember what they covered, a person stating when they are free so they
can be matched. If a number cannot be computed from existing records, the
answer is that the program does not get that number, **not** that volunteers
get a new form.

`tests/admin.test.js` states this at the top: if an assertion there ever needs
a new field on a person or a session to pass, that is the signal a screen is
about to start asking volunteers for something.

**Status is computed, never stored.** `rosterRows` derives paired / unpaired /
not-accepting / inactive from the pairings table every time it is asked. A
stored status is a field somebody has to remember to update, and it is wrong
the moment they forget.

**`#/admin/attention` is the highest-value screen.** It answers "which pairings
have quietly stopped?", which nobody reports: the tutor assumes the student is
busy, the student assumes the tutor is busy, and a pairing can be over for two
months before anyone says so. Every row carries contact details because the
intended next step is a human writing to another human.

**A pairing that never met is measured from when it started**, so a
pairing created yesterday does not appear on day one.

**Month and week boundaries resolve in the admin zone, not UTC.** There is a
test pinning that somebody who joined at `2026-06-01T00:00Z` belongs to *May*
on a chart a New York coordinator is reading.

**Removing a person is refused when they have logged sessions.** Those are
volunteer hours a real person earned, and a coordinator tidying a list should
not be able to delete them with one click. The store raises an error with a
`has-history` code and the screen offers marking them inactive instead.

**No charting library.** `js/chart.js` is about forty lines of arithmetic
returning coordinates and path strings; the view turns them into inline SVG.
Any library would be a CDN dependency or a build step, and this app can afford
neither. The geometry is a separate module because an off-by-one in a y-scale
is invisible on screen and obvious in an assertion.

## What the admin screens will never have

Requests for these will come. The answer is no, and this is the reason.

**Strike tracking. Suspension management. Compliance dashboards. Automated
nagging.**

Principle 3 is not a preference about tone, it is a structural decision. Every
one of these turns a volunteer relationship into a managed one, and the people
being managed are unpaid teenagers and children. A tutor who misses two weeks
does not need a warning; they need somebody to ask whether they are all right.

Specifically:

- `quietPairings` surfaces a pairing so a human can start a conversation. It
  stores nothing against anybody and must never acquire a threshold that
  triggers an action.
- `recentMisses` is per-session and deliberately not keyed by person. There is
  a test asserting its shape, because a per-person tally is a strike count
  with a friendlier name.
- Nothing anywhere sends a message automatically, and nothing should.

If a coordinator genuinely cannot run the program without one of these, the
problem is the size of the program or the number of coordinators, and the fix
is not in this codebase.

## Accessibility and polish, as enforced rules

`tests/a11y.test.js` checks these against what the browser computed, not what
the source looks like. It needs a browser and reports as skipped in Node.

**Contrast is measured, not eyeballed.** The test parses the live stylesheet —
both `:root` and the `prefers-color-scheme: dark` block — and asserts every
foreground/background pair the app renders clears 4.5:1. This caught
`--ink-faint` at 3.25:1 on `--paper-3`, and `#c33` at 3.50:1 on the dark
background. There is now one `--danger` family so nothing hard-codes a red
that only works in one theme.

**Never remove a focus ring.** A test fails the build if any `:focus` rule sets
`outline: none`. It caught `.app-main:focus`, which left skip-link users with
no idea where they had landed.

**A short visible label is not an accessible name.** The log chips read "30",
"60", "None", "15" — and those repeat across three groups. Reading the real
accessibility tree showed a screen reader announcing "button 30 … button 30"
for two different questions. Each chip now carries an `aria-label` combining
its group and value ("Prep 15 min"), and a test fails on any two chips sharing
a name.

**A placeholder is never a label.** The covered field used last session's notes
as its placeholder, which made an empty field read as though it had a value.
It is now a real `label[for]` plus a hint element referenced by
`aria-describedby`, and a test asserts the accessible name is not the
placeholder.

**Touch targets grow on a coarse pointer.** Measured on a real phone viewport,
the small buttons, nav links and header controls were landing at 34–39px. A
`@media (pointer: coarse)` rule takes everything interactive to 44px.

**Every date carries its zone.** `stampInZone` exists so no screen shows a bare
date: a tutor in California and a student in Beijing read the same instant on
different days, and an unlabelled date invites each to read it as their own.

**Views load on demand.** Routes use dynamic `import()` — native to ES modules,
so still no build step. A student on a phone no longer downloads the admin
dashboards, the matcher and the chart module to read their homework: 9 modules
instead of 28, and 60 KB of JS gzipped instead of 114 KB.

**Every async action goes through `withBusy`.** The control disables and says
what it is doing, failures surface the real message rather than a generic
apology, and the control always comes back — a button stuck disabled after an
error is worse than the error.

**Language is stored per person.** `evf.lang:<viewAs>`, so a coordinator
handing their phone to a parent does not have to re-pick the language, and a
student's Chinese default is not overwritten by an admin choosing English.

An honest limit: these tests read the accessibility tree, which is what a
screen reader consumes. That is not the same as listening to VoiceOver or NVDA,
and does not replace doing so before a real launch.

## Browser floor

Safari / iOS **15.4+**, plus current Chrome, Edge and Firefox. Set by
`:focus-visible` and `100dvh`; both have fallbacks in `css/base.css` and
`css/layout.css`.

Two rules that exist because of WebKit and must not be relaxed:

- **Never hand `Date` a non-ISO string.** Everything reaching `Date` or
  `Date.parse` is a full ISO 8601 UTC string, validated at the store boundary
  by `ISO_UTC`. Safari rejects looser formats Chrome accepts, and an
  `Invalid Date` that only appears on one browser is the worst possible bug in
  a scheduling app.
- **Midnight can come back as hour 24** under `hourCycle: 'h23'`.
  `wallPartsInZone` takes `hour % 24` for exactly this reason.

## Class chat

`js/chat.js`, `#/messages` and `#/messages/:pairingId`. One thread per
pairing — a tutor with two students has two conversations, not one group.

Threads are **derived from pairings, never stored**, so a class cannot exist
without a thread and a thread cannot exist without a class.

**Two rules that are not preferences, because the users are minors:**

- **The coordinator is in every thread.** Structurally, not as a moderator who
  can be removed and not behind a setting. `participantsOf` returns
  `adminPresent: true` unconditionally and there is a test walking every
  pairing and every viewer to prove no combination produces a thread without
  them.
- **There are no private messages.** No tutor-to-student channel, no direct
  line that bypasses the thread. Adding one removes the only safeguard this
  design has.

**No read receipts, typing indicators, "last seen", or per-person message
counts.** A chat that reports who has read what turns a conversation into a
compliance surface, which principle 3 rules out. `tests/chat.test.js` asserts
the absence of those fields by name.

**Unread is the one number in the app that is a service rather than a score.**
It is about what somebody said to you, it is computed from a marker in the
reader's own browser (`evf.read:<viewAs>`), and it **never enters the program
document or an export** — see `readState`. Contrast the tutor nudge, which is
deliberately a list with no number at all.

**Withdrawing keeps a tombstone.** `deleteMessage` clears the body and sets
`deletedAt`; the row stays. A message that vanishes without trace, in a thread
involving a child, is worse than one visibly withdrawn — a parent who saw
something and came back to find nothing has no recourse.

**A guardian is not a record here either.** They post against the student's id
with `authorRole: 'guardian'`, which is what distinguishes them, and they read
the same thread their child reads rather than a filtered one.

**The screens must not imply delivery.** There is no server, so a message is
saved in the browser that wrote it and reaches nobody. Both screens say so.
Remove that notice only when a sync layer actually exists.

## The self-test panel

`#/selftest` runs the timezone assertions in the reader's browser and shows
pass/fail. It exists to be shown to someone deciding whether to trust the app —
a club officer cannot read a test suite, but they can read "Saturday 09:00 in
Beijing is Friday 18:00 in California — checked, passing".

The scenarios live in `js/selftest.js`, which is **the single source of truth**:
the panel renders them and `tests/time.test.js` imports the same list and
asserts every one passes. Neither restates an expectation, so they cannot drift.

Each scenario carries a bilingual `title` and `why` as `{ en, zh }` pairs, and
`runSelfTest({ lang })` resolves them. A scenario added without Chinese fails
the suite — the panel is exactly the screen a Chinese-side stakeholder would be
shown, so principle 6 applies to it in full.

Adding a scenario: append to `SCENARIOS` with an `id`, a `category` from
`CATEGORIES`, bilingual `title`/`why`, and a `run()` returning
`{ pass, expected, actual, note }` via the `expect`/`expectAll` helpers. Use
fixed instants only — nothing may call `Date.now()`, or the panel would say
something different next year.

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

Existing migrations: `5 → 6` (adds `messages`), `4 → 5` (`program.sampleData`),
`3 → 4` (tutor `interests`), `2 → 3` (`acceptingStudents`, `occurred: null`),
`0 → 1` (the pre-versioned prototype: loose top-level
settings, `endsAt` instead of `durationMinutes`) and `1 → 2` (split
`tutors`/`students` into `people`; `matches` → `pairings`; availability lifted
out of the person; sessions moved to `pairingId` and `occurred`). Version is
read from `version`, falling back to v1's `schemaVersion`, falling back to 0.

## Import must never half-apply

`validate()` separates two kinds of problem, and the distinction is the whole
design:

- **errors** — bad types, duplicate ids, references to records that are not in
  the file. The import is refused outright with every problem listed, and live
  state is untouched. A half-applied import is worse than a rejected one.
- **warnings** — a tutor with no availability, an unrecognised English level, a
  missing name. These pass through and get surfaced. A coordinator hand-editing
  JSON at 11pm should get their data back plus a list of what looks off.

`parseProgramJson()` and `parseCsvText()` do the work without touching state;
`importJson()` and `importCsv()` wrap them and only then commit. Tests use the
former, which is why `tests/store.test.js` never risks the real localStorage key.

## CSV

`importCsv(file, type)` merges: new rows by id are added, existing rows are
updated, **nothing is ever deleted by an import.**

The subtle part: `parseCsvText()` returns fully-defaulted records so a genuinely
new row is complete, *and* a `providedColumns` list of what the file actually
contained. A merge must patch only the provided columns. Spreading a defaulted
record over an existing person would blank the fields the CSV never mentioned —
that bug silently reset join dates and subject lists before it was caught, and
there is a test pinning it now.

Availability has no id, so a CSV import replaces every row for the people named
in the file. Appending would silently double a person's availability on a
re-import.

## Privacy

`data/sample.json` is synthetic and stays synthetic: one coordinator, two tutors
and five students, paired two and three. It is small on purpose — a demo you can
hold in your head beats one with thirty invented people — so it no longer
demonstrates a student nobody can teach or two students competing for one tutor.
Both need a bigger roster; the generator that builds it is not committed, so
regenerating means writing one. Every name in it is a
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
