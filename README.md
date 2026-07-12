# AI Daily Briefing

A zero-maintenance Google Apps Script that reads your **Gmail, Google Calendar, Google Tasks, and recent Drive files**, sends them to the **Gemini API**, and delivers a prioritized, beautifully formatted morning briefing straight to your inbox — every day, automatically, for free.

The AI doesn't just list your data. It's prompted to *infer connections*: an upcoming appointment triggers prep reminders, a document shared last night becomes a reading task, and a "Heads Up" section surfaces blindspots, blockers, and follow-ups you might have missed.

## What a briefing looks like

Each email contains three sections rendered in a clean "SaaS dashboard" style:

- **New Updates & Calendar Prep** — items that arrived since your last briefing, plus prep needed for the next 2 days of appointments
- **Your Focus for Today** — prioritized tasks grouped into friendly life themes (Home & Family, Logistics, Personal Admin...)
- **Heads Up: Blindspots & Blockers** — inferred follow-ups, hidden deadlines, and things quietly going wrong (a full storage account, a low balance before scheduled payments, a trip you haven't packed for)

See included screenshot (sample-briefing.png)

## How it works

```
Time trigger or bookmark URL
        │
        ▼
┌─ Gather context ──────────────────────────────┐
│  Calendar (next 8 days)                       │
│  Tasks (all lists, incomplete only)           │
│  Gmail (14 days, priority-first, no self-refs)│
│  Drive (5 most recently modified Docs/Sheets) │
│  Optional custom Google Sheet                 │
└───────────────────────────────────────────────┘
        │
        ▼
Gemini API (system prompt + raw data, separated)
        │
        ▼
Validated HTML briefing → your inbox
```

Notable engineering details:

- **Priority-first inbox scanning**: unread, starred, and important (Gmail's importance marker) threads are fetched first so they always make the cut in a busy inbox, get longer body snippets (1000 vs. 600 chars), and are tagged so the AI weights them when prioritizing
- **Self-exclusion**: prior briefings are filtered out of the Gmail search, so the model never summarizes its own output
- **Deterministic "last run" tracking** via Script Properties, injected into the prompt as a fact instead of asking the AI to guess
- **Timezone-safe date handling** — one formatter everywhere, and Tasks API due dates are parsed as strings (never `Date` objects) to avoid the classic UTC-midnight off-by-one-day bug
- **Concurrency + duplicate-run guards** (`LockService` + optional cooldown window)
- **Retry with exponential backoff** on 429/5xx — important on the Gemini free tier
- **Output validation**: safety blocks, truncation, and non-HTML responses trigger an error email with the collected payload attached, instead of delivering garbage
- **Prompt injection hardening**: instructions live in the `systemInstruction` field, data in the user turn, with an explicit rule that inbox content is data, never instructions

## Setup

### 1. Create the project

Go to [script.google.com](https://script.google.com), create a new project, and add the two script files (`Code.gs`, `ListModels.gs`). To use the included `appsscript.json`, enable **Project Settings → Show "appsscript.json" manifest file** and paste it in (set `timeZone` to [your timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) — it controls all date handling in your briefing).

### 2. Enable Advanced Services

In the editor sidebar: **Services → +** and add:

| Service | Version | Used for |
|---|---|---|
| Tasks API | v1 | Reading all task lists |
| Drive API | v3 | Server-side "most recently modified" file sorting |

(If you pasted the manifest, these are already declared — the editor will just confirm them.)

### 3. Get a Gemini API key

Create a free key at [Google AI Studio](https://aistudio.google.com). The free tier is sufficient for daily briefings.

### 4. Set Script Properties

**Project Settings → Script Properties:**

| Property | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Your Gemini API key |
| `GEMINI_MODEL` | Recommended | Pin a model version (e.g. `gemini-2.5-flash`). Run `checkMyAvailableModels()` in `ListModels.gs` to see your options. Avoid `-latest` aliases — they can change behavior overnight. |
| `CUSTOM_SHEET_ID` | Optional | ID of a Google Sheet to include as extra context (transaction log, habit tracker, etc.) |
| `CUSTOM_SHEET_GID` | Optional | The tab GID within that sheet (the number after `gid=` in the URL, e.g. `0`) |
| `MIN_HOURS_BETWEEN_RUNS` | Optional | Skip duplicate runs within this window (e.g. `6`). Unset or `-1` disables the guard. |
| `LAST_RUN` | Auto | Managed by the script — don't set it manually |

### 5. Deploy as a web app (manual trigger)

**Deploy → New deployment → Web app**, with:

- **Execute as:** Me
- **Who has access:** **Only myself** ← important, see [Security](#security--privacy)

Bookmark the deployment URL. Opening it runs a briefing on demand; the page shows live status (processing → success/skipped/error). Append `?force=true` to bypass the cooldown window.

### 6. Add a time trigger (automatic mornings)

**Triggers → + Add Trigger:**

- Function: `sendZeroMaintenanceDigest`
- Event source: Time-driven → Day timer → pick your morning hour

The first run will show an OAuth consent screen requesting access to Gmail, Calendar, Tasks, and Drive — this is the script running under *your own account*; no third party is involved.

## Customization

All volume knobs live in the `CONFIG` object at the top of `Code.gs` — calendar lookahead, inbox lookback, thread/character limits, and the briefing subject line (which also drives the self-exclusion filter, so change it in one place only). The AI's personality, section structure, and the HTML email template live in the `systemInstruction` string.

## Security & privacy

**Read this before deploying.**

- **Your data is sent to the Gemini API.** Email snippets, calendar entries, task lists, and document previews leave your Google Workspace and are processed by Google's Generative Language API. On the **free tier, Google may use API content to improve its products** (per their [terms](https://ai.google.dev/gemini-api/terms)) — review current terms and decide if that's acceptable for your inbox contents. Paid-tier keys have stricter data handling.
- **Keep web app access set to "Only myself."** The briefing endpoint triggers reads of your entire inbox; never deploy it with "Anyone" access.
- **The API key lives in Script Properties** and is sent via the `x-goog-api-key` header (not the URL), keeping it out of logs. Never hardcode it.
- **Prompt injection is mitigated, not eliminated.** A malicious email could still try to influence the briefing text. Blast radius is low (the output only goes to your own inbox), but treat surprising briefing content skeptically.
- Error emails attach the collected data payload (capped at 50 KB) — useful for debugging, but remember those emails then contain a snapshot of your inbox data.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Could not fetch Drive files..." in the briefing | Drive Advanced Service not enabled, or added as v2 (this project uses v3 syntax) |
| Error email with `finishReason: MAX_TOKENS` | Model spent its budget on reasoning — confirm `thinkingBudget: 0` is intact, and don't add a low `maxOutputTokens` cap |
| Error email with `finishReason: SAFETY` | Something in your inbox tripped Gemini's safety filters; usually resolves next run |
| 429 errors exhausting retries | Free-tier rate limit — wait a few minutes, or check your quota in AI Studio |
| Briefing shows yesterday's date for tasks | You're likely constructing `Date` objects from Tasks API due strings somewhere — don't; see the comment in section 2 |
| Web page shows green but no email | Check **Executions** in the Apps Script editor for the real error log |

## License

MIT — see [LICENSE](LICENSE).
