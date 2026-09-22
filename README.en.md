# Shangan Plan · Universal Exam Prep

[![tests](https://github.com/l3187773278-star/shangan-plan/actions/workflows/test.yml/badge.svg)](https://github.com/l3187773278-star/shangan-plan/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#project-layout)

[简体中文](README.md) | **English**

> A **zero-dependency, zero-build** exam-prep assistant (PWA) that covers many kinds of exams.
> On first launch a three-step wizard generates your study phases, milestones and first tasks;
> after that it handles the countdown, daily check-ins, a Pomodoro timer, spaced-repetition review
> and study statistics. Your data never leaves your own browser.

**Live demo:** https://l3187773278-star.github.io/shangan-plan/ — open it on a phone and choose
"Add to Home Screen" to use it full-screen, offline.

Supported exam types: postgraduate entrance exam / college upgrade (专升本) / Gaokao / CET-4 & 6 /
civil service / teacher certification / IELTS & TOEFL / custom.

---

## Features

| Module | What it does |
|---|---|
| Setup wizard | Pick an exam type → enter school and exam date → choose subjects and a daily memory target. Generates a phase roadmap, milestones and the first three days of tasks. |
| Today | Exam countdown, overall progress, check-in, today's tasks grouped by subject, a "minimum three" fallback set, memory target, and cards due for review. |
| Plan | Schedule tasks day by day, with a week overview that starts on Monday so progress is visible at a glance. |
| Focus | Pomodoro timer: time accumulated per subject, a chime on completion, and **the timer survives a page refresh** (elapsed time is recovered from timestamps). |
| Review | Spaced-repetition flashcards (SM-2) plus random closed-book self-testing. Cards you get wrong reappear the same day and get harder. |
| AI questions | Connects to DeepSeek: generate questions for a subject and topic, grade your answers, and file them into the card library or mistake book with one click (bring your own API key). |
| Notes / mistakes | Four-line note template, a reading overlay for long texts, and mastery flags for mistakes. |
| Stats | Three 7-day charts (focus minutes, task completion rate, review volume), a per-subject breakdown, and streak counting. |
| Moving devices | Export/import a JSON backup; a computer and a phone on the same Wi-Fi merge both sides automatically. |

## Running it

### On a computer (recommended)

```bash
npm start          # same as node serve.js — starts the local server and opens your browser
```

On Windows you can also just double-click **`启动.bat`** (which runs `node serve.js`).

> **Always open it through the local server — don't double-click `index.html`.**
> When opened via `file://`, some browsers refuse to let the page write to localStorage, which shows
> up as "I added a task, refreshed, and it was gone". If you do open it as a file, the app pops up a
> notice telling you to use `启动.bat` instead.

### On a phone

**Option A: same Wi-Fi (no deployment)**

1. Run `npm start` on the computer (or double-click `启动.bat`);
2. The startup window prints an address like `http://192.168.x.x:4000` for your phone;
3. Connect the phone to the same Wi-Fi and open that address in a browser.

> If it won't load, it is almost always the firewall: Windows Security → Firewall & network
> protection → Allow an app through firewall → tick **Node.js JavaScript Runtime** for **Private**
> networks.

**Option B: deploy to GitHub Pages / Netlify / Cloudflare Pages**

Publish the repository root as a static site — it is pure front end, with no build step. On a phone,
choose "Add to Home Screen" to get a full-screen app-like experience with offline support.

> Note: once deployed publicly, the "computer ↔ phone LAN sync" is unavailable (it depends on the
> local `serve.js`). Everything else, including data persistence, works normally.

### Data and backups

- All data lives in browser `localStorage` — **nothing is uploaded to any server**, no accounts, no analytics;
- Moving devices: `More → Settings & backup → Export`, then import on the new device;
- Clearing browser data wipes your records, so export regularly.

## Project layout

```
.
├─ index.html         single-page shell (four main views plus sub-pages)
├─ core.js            pure logic: dates, SM-2, multi-device merge, de-duplication, streaks (no DOM, unit-testable)
├─ js/
│  ├─ bus.js          module communication: a few dozen lines of pub/sub, breaking the data ↔ view cycle
│  ├─ exams.js        template data for the eight exam types (pure data, no logic)
│  ├─ ui.js           UI primitives: formatting, DOM helpers, toasts, modals, subject colours
│  ├─ data.js         state hub: the only owner of the data, the only reader/writer of localStorage, all mutations + sync
│  ├─ timer.js        Pomodoro: persisting the running state and recovering it across refreshes
│  ├─ views.js        view layer: rendering each view, form modals, AI question interaction
│  └─ boot.js         startup and event wiring: the single entry point where every button action is dispatched
├─ styles.css         styles (including responsive and print styles)
├─ serve.js           local server: static hosting + Range/ETag/precompression + api/sync + DeepSeek proxy
├─ sw.js              Service Worker: network-first with offline fallback
├─ manifest.json      PWA manifest
└─ test/              automated tests (Node's built-in runner, zero dependencies)
```

### Three deliberate trade-offs

1. **Algorithms get their own layer (`core.js`).** When these functions are wrong they don't throw —
   data is quietly lost or scrambled. So they touch no DOM, no `localStorage` and no system clock
   (time is injectable), which means every case can be asserted in Node.
2. **Events instead of direct calls.** After a data change the only thing that happens is
   `emit('change')`, and `boot.js` re-renders everything in one place. Otherwise `data.js` would have
   to depend on the view layer, and splitting the modules would buy nothing.
3. **`state` is exposed through a getter.** Importing a backup, merging a sync and clearing data all
   replace the state object wholesale; a getter guarantees every module sees the latest reference
   instead of a stale copy.

## Tests

```bash
npm test          # node --test  →  55 cases
npm run check     # syntax check across every script
npm run lint      # ESLint (needs npm install first)
npm run format    # Prettier (needs npm install first)
```

The tests are entirely zero-dependency, using the `node:test` built into Node 18 and later.

> Use `node --test` **with no arguments** (it discovers the cases under `test/` itself). Writing
> `node --test test/` works on Node 20, but from Node 22 on `test/` is treated as the module to
> execute and it fails with `Cannot find module`.

**Algorithms and data (`test/core.test.js`, 30 cases)**

- SM-2: the 1 → 6 → interval × ease growth order, reset and same-day requeue after a wrong answer,
  the 1.3 ease floor, the pass boundary for grades 3/2, and safe upgrade of old cards missing fields;
- Multi-device merge: using the newer side as the base without losing the other side's records,
  id conflicts, idempotence when merging repeatedly, check-in being true if either side says so,
  and de-duplication of review records;
- Dates: month/year/leap-year arithmetic, day differences, stability across daylight saving;
- Data cleanup: tasks de-duplicated by "date | subject | title" preferring completed ones, cards by "subject | question";
- Statistics: streaks (a day without a check-in counts from yesterday), cumulative check-ins, focus minutes per day;
- AI request assembly: a direct call to the provider must carry the `Authorization` header and must
  not leave the key in the body, while proxy mode is the opposite. This path is **only reachable once
  deployed over https** — running locally through `启动.bat` never exercises it, so it is pinned by a test.

**Wiring contract (`test/contract.test.js`, 12 cases)**

When you split modules, what breaks is rarely the algorithms — it is the wiring. So that is asserted too:

- every `#id` referenced in code really exists (declared in HTML or generated in JS);
- every `data-action` has a dispatch branch (so no button silently does nothing);
- `index.html` loads scripts in dependency order, and the `sw.js` cache list covers every script;
- the `SG.*` namespaces each module mounts match what callers expect, and everything `boot.js` calls is really exported;
- the SM-2 formula exists in exactly one place, and `core.js` has no DOM or storage dependencies.

**Startup smoke test (`test/boot.test.js`, 13 cases)**

Runs the real startup flow in a minimal fake DOM, with no browser, executing all eight scripts in order, and asserts:

- every script loads and executes (white-screen bugs are caught here, naming the file and line);
- startup writes no `console.error` / `console.warn`;
- a dozen key containers **really receive content** (not merely "no error"), and switching every view throws nothing;
- simulated clicks reach the data layer and persist; the Pomodoro timer starts and stops; unavailable storage pops a notice instead of losing data silently;
- a simulated AI question request: over https it must call the provider directly with the auth header, over http it must go through the local proxy — both paths are pinned.

## Technical notes

- **Zero dependencies, zero build**: no framework, no bundler; `npm install` installs nothing (devDependencies are only needed for lint/format).
- **Offline first**: the Service Worker is network-first with a cache fallback, so check-ins and review still work with no connection.
- **Local server**: `serve.js` uses only Node built-ins and supports HTTP `Range` (seeking in large files), `ETag`/304 negotiation and precompressed `.gz` assets, and acts as a reverse proxy for the DeepSeek API to sidestep browser CORS.
- **Two-device sync**: the computer writes its data to `_sync-data.json`; both sides union records by id and pick a base by `savedAt`. Merging only ever adds, so a record deleted on one side cannot be resurrected by the other.
- **Data stays local**: the AI key is stored locally only, and requests go out through the local server.

## Browser support

Modern Chrome / Edge / Safari (needs `fetch`, Service Workers and CSS variables). IE is not supported.

## About AI-assisted development

AI tools took part in this project (Codex scaffolded the framework, DSH implemented it). Requirements,
feature trade-offs, data-structure design, acceptance tests and every round of revision were done by
me; the layering of `core.js` and this test suite exist so that every change can be verified.

## License

MIT
