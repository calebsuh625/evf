# Handover

For whoever is running PeerBridges next.

You do not need to be able to code to run this. You need to know four things:
where the data file lives, how to add and remove people, how to export, and
what not to do. That is this document.

**The app:** <https://calebsuh625.github.io/evf/>

---

## The one thing that matters

**The program lives in a single JSON file that you keep.**

Not on a server. Not in this repository. Not in anyone's account. One file.

The website is just a way of reading and editing that file. If the website
disappeared tomorrow, the file would still contain every tutor, every student,
every pairing and every hour anyone has volunteered. If the file is lost, that
is gone, and nothing can bring it back.

So: **export a backup at the end of every month, and at the end of every term.**
It takes one click.

### Where the file should live

Somewhere that is not one person's laptop:

- the club's shared Google Drive or OneDrive folder, **and**
- your own copy, so it survives losing access to the shared folder.

Name them by date — `peerbridges-2-0-2026-07-30.json` — and keep the old ones.
They are small (about 100 KB) and an old backup has saved more than one program.

> **Write down here where yours actually lives, and keep this line updated:**
>
> `Real data file: ______________________________________________`
>
> `Backups also kept: __________________________________________`

### Never put real data in the repository

The app has no server, on purpose: there is no database of children's names,
schools and guardian contacts sitting anywhere to be leaked. Committing a real
export would throw that away in one keystroke.

**Do not** put real records in `data/`, in a test, in an issue, in a pull
request, or in a screenshot. The students are minors. The demo data in the
repository is entirely invented and must stay that way.

---

## Start of term

Work down this list. It takes about an hour the first time.

**1. Get the data file.**
Ask the outgoing coordinator for the latest JSON backup. Open the app, go to
**Export**, and drop the file onto **Restore**. Everything appears.

If you see an orange banner saying *"This is demo data"*, you are looking at the
sample dataset, not your program. Load the real file.

**2. Check who is actually coming back.**
Go to **Roster**. For everyone who is not returning this term, open them and
press **Mark inactive**. Do not delete them — see [Removing people](#removing-people).

**3. Update availability for returning tutors.**
School timetables change every term, so last term's availability is usually
wrong. Ask each returning tutor to open **My availability** and update their
weekend windows. They can also switch off *"Open to a new student"* if they are
full or busy.

This is the single highest-value thing you will do all term. The matcher can
only work with what people have told it.

**4. Add the new sign-ups.**
See [Adding people](#adding-people). Names only is fine to start with.

**5. Pair everybody.**
Go to **Matching**. Each waiting student shows their best few tutors with the
reasoning spelled out. Read it, and press **Pair them** on the one you agree
with. Nothing is ever paired automatically.

Students nobody can take appear underneath with the specific reason and what
would have to change — usually "recruit a tutor who teaches X" or "ask this
student for one more available slot".

**6. Export a backup.**
Right now, before anything else happens. **Export → Download backup.**

**7. Check the clocks changed correctly.**
If the term crosses a US daylight-saving switch (second Sunday in March, first
Sunday in November), open **Matching** afterwards and look at *"Pairings that no
longer share any time"*. China does not change its clocks and the US does, so a
pairing that worked in October can stop working in November without anyone
noticing.

---

## Every week or two

Open **Needs attention**. It is the only screen that tells you things nobody
will report on their own:

- **Pairings that have gone quiet** — no class logged for two weeks or more.
  Neither side will tell you; the tutor assumes the student is busy and the
  student assumes the tutor is busy. Message them and ask how it is going. Each
  row has their contact details right there.
- **Students with no tutor** — go to Matching.
- **Tutors with room** — a volunteer with nothing to do drifts away quietly.
  Worth finding them a student, or just checking in.
- **Classes that did not happen** — one is normal and means nothing. Several in
  a row usually means something changed: exams, a new school timetable, a family
  moving.

None of this is a disciplinary system and it must not become one. Nobody is
scored, nothing is counted against anyone, and the app never sends anyone a
message. It shows you a name and a phone number so a person can ask another
person if they are all right.

---

## Adding people

**Roster → Add a tutor** or **Add a student**. Type a name and press Add.

That is genuinely all that is required. Everything else — school, subjects,
availability, guardian contacts — can be filled in later, by them, or never. A
record with only a name is a valid record. Never hold up a student because a
field is blank.

For a whole sign-up sheet at once, use **Import roster CSV** on the same screen.
Export the tutors or students CSV first to see the column names; the only
required column is `name`. An import adds new people and updates existing ones
by id, and never deletes anything.

### What is worth filling in eventually

For **tutors**, so matching works:

| Field | Why |
|---|---|
| Skills | Which parts of English they can teach — matched against what students asked for |
| Levels taken | Which English levels they are comfortable with |
| Maximum students | Their own limit. The app never exceeds it |
| Availability | They set this themselves under *My availability* |
| Meeting link | Appears on their student's screen as *Join the class* |

For **students**:

| Field | Why |
|---|---|
| Goals | Which parts of English they want help with |
| English level | So they are not paired with a tutor who cannot pitch it |
| Availability | Set by you or them, in Beijing time |
| Interests | Only affects the ranking slightly, but makes first sessions easier |

Guardian contact fields are **optional and stay optional**. A family that gives
you nothing has given you a complete answer. They can fill them in themselves
by selecting *Guardian of …* in the picker at the top right.

## Class chat

Every class has one group chat: the tutor, the student, their parent if the
family is using the app, and **you**. You are in every one of them and cannot be
removed — this is a program for children, so an adult can always see every
conversation. There are no private messages between a tutor and a student.

It is under **Messages**. Nobody is scored on replying and nothing tracks who
has read what.

**One thing to know before you tell families about it:** the app has no server,
so a message is saved in the browser it was typed in and does not reach anyone
else. Every screen says so. Until that changes, treat it as notes rather than a
way to contact somebody, and keep using WeChat or email for anything that
actually has to arrive.

## Sign-in

Under **Sign-in** on the coordinator's menu. It is optional — the app works
without it, and a program that has never set it up is never locked.

If you do turn it on:

1. Create your own account first. **Write that password down somewhere safe
   before you close the tab.** There is no server and no reset email; nobody
   can recover it for you, though a second coordinator account can be created
   as a spare.
2. Use **Give access** for everyone else. It generates a username and a short
   code — read them out over WeChat. Families never have to create an account,
   invent a password, or fill anything in.

   Or let people **create their own account** from the sign-in screen, which
   saves you reading out a dozen codes at the start of term. A new account
   appears under **Waiting to be confirmed** and **sees nothing at all** until
   you pick their name from the list and press Confirm. Do not skip that step
   or leave it for a week: until you do it, a real tutor is locked out — and
   the reason it exists is that anyone who finds the link can type any name.
3. A code is shown **once**. If somebody loses theirs, press **New code**; it
   takes a couple of seconds and nothing is lost.

**Be honest with families about what this is.** Signing in stops people seeing
each other's screens on a shared phone or laptop. It does **not** protect the
data: the whole program sits in the browser, and anyone who knows how can read
it. That is true of every version of this app until it has a real server. The
app says so on the sign-in screen; please do not tell anyone otherwise.

## Removing people

**Mark inactive, don't delete.**

Open the person from the Roster and press **Mark inactive**. They stop appearing
on every active list, in matching and in attention, and their history stays
intact.

The app will refuse to delete somebody who has logged classes, and it is right
to: those are volunteer hours a real person earned, and a tutor may need that
record years later for a college application. You will see:

> *Avery Alpha has 26 logged session(s). Removing them would delete volunteer
> hours somebody earned. Mark them inactive instead.*

Deleting is only allowed for someone with no history at all — a duplicate row,
or a sign-up who never started.

To end a pairing without removing anybody, that is a pairing status, not a
person. Ask whoever maintains the code if you need this and cannot find it.

---

## Exporting records

### Backups — do this monthly

**Export → Download backup.** One dated JSON file, everything in it. This is the
one that matters.

### A tutor's volunteer hours

Tutors do this themselves: **My hours → Print / save as PDF**. It produces a
*Volunteer Service Record* with the organisation, the activity, the period, the
hours split into teaching / prep / follow-up, every session listed, and
signature lines. It is formatted for NHS, the Congressional Award and the
President's Volunteer Service Award.

You sign it. The hours are computed from the classes tutors logged at the time,
not typed in afterwards, which is exactly what makes it worth signing.

**How the hours are worked out:** every class a tutor held counts as **2 hours**
— the class itself plus preparation and follow-up. Nobody is asked how long a
class ran, so a class that finished early counts the same as one that overran.
The printed record says this in a box on the page, so whoever signs it knows
exactly what they are attesting to. Do not remove that line: it is what makes
the figure honest rather than an estimate presented as a measurement.

If you need every tutor's totals at once: **Export → Hours by tutor** (CSV).

### Spreadsheets

**Export** offers CSVs of the roster, availability, pairings and sessions. The
first four can be edited and re-imported. Hours and the session report are
computed, so they are export-only — nobody should ever be typing hours in by
hand.

---

## If something looks wrong

**The app is showing demo data.** An orange banner at the top says so. Go to
Export and restore your real backup.

**Numbers look wrong.** Almost everything is computed from logged sessions, so
the usual cause is sessions not being logged. Check *Needs attention*.

**A tutor says the time is wrong.** Open the pairing's student page — every time
is shown in both zones with the zone named. If they disagree, check
<https://calebsuh625.github.io/evf/#/selftest>, which re-runs the timezone
assertions in your browser and shows them passing or failing.

**Nothing loads / the page is blank.** You may have opened `index.html` from a
folder instead of the web address. Use the URL at the top of this file.

**You imported the wrong file.** Restore the correct backup. Import replaces
everything, so nothing is merged or half-applied.

**You lost the data file and have no backup.** There is no recovery. This is why
step 6 exists.

---

## Handing it on

Two things:

1. The latest JSON backup.
2. This URL: <https://calebsuh625.github.io/evf/>

No account to transfer, no password, no server anybody has to keep paying for,
nothing to install. Point the next person at this file.

If you also want to hand on the code, it is at
<https://github.com/calebsuh625/evf> — read [CLAUDE.md](CLAUDE.md) first. It
records what the program deliberately does **not** do, and why. The most
important of those: no strikes, no suspensions, no compliance dashboards, no
automated nagging. The people here are unpaid teenagers and children, and the
app is built so that a volunteer who goes quiet gets a message from a human
rather than a warning from a system. Please keep it that way.
