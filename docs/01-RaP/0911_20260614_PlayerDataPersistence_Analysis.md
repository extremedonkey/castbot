# 0911 — Player Data Persistence Performance Analysis

**Status:** RaP (analysis — not yet implemented)
**Date:** 2026-06-14
**Author:** Claude (investigation requested by Reece)
**Related:** [0915 Memory Leak / OOM](0915_20260603_MemoryLeakOOM_Analysis.md) · [Request Scoped Caching](../enablers/RequestScopedCaching.md) · `storage.js`, `safariManager.js`, `atomicSave.js`

---

## 🎯 Trigger Prompt (original, unmodified)

> "identify the best optimization I could make"
>
> (later) "continue your full investigation as you were, give me a full report, a tldr at the end then capture it in a RaP. Include incidental info on other hypotheses / things you found but feel free to choose your own destiny in terms of narrowing in on the playerData problem etc"

---

## 🤔 Plain English — What's Actually Slow

CastBot's "database" is two big JSON files on disk:

- `playerData.json` — **3.65 MB on disk** (2.25 MB of real data + 1.46 MB of whitespace), 165 guilds, 1,957 players
- `safariContent.json` — **2.7 MB**, same access pattern

On **nearly every Discord interaction**, the bot:

1. Reads the whole file from disk (~19 ms),
2. **`JSON.parse`s it (~34 ms) — synchronously, blocking the Node event loop**,
3. Mutates a tiny part of the parsed object,
4. **`JSON.stringify`s the *entire* object (~29 ms) — also blocking**,
5. Atomically rewrites the whole 3.65 MB file (temp write + fsync + rename).

Steps 2 and 4 are the problem. `JSON.parse`/`JSON.stringify` are synchronous — while they run, the bot **cannot process any other interaction**. Discord enforces a hard **3-second deadline**; under concurrent load these blocking windows stack and produce intermittent "This interaction failed" errors. Every cold load also allocates a 3.65 MB string + a full parsed object tree, feeding the GC pressure already documented in the [OOM RaP](0915_20260603_MemoryLeakOOM_Analysis.md).

### Measured costs (on the real `playerData.json`)

| Operation | Cost | Blocks event loop? |
|---|---|---|
| `fs.readFile` (3.65 MB) | 19 ms | No (async I/O) |
| `JSON.parse` | **34 ms** | **Yes** |
| `JSON.stringify(data, null, 2)` | **29 ms** | **Yes** |
| `JSON.stringify(data)` (compact) | 26 ms → **2.25 MB** | Yes |
| Atomic write (3.65 MB) | tens of ms | Partly |

**38% of `playerData.json` is pretty-print whitespace.** Biggest single guild: **0.42 MB** (vs the 2.25 MB monolith). Call sites: **377 `loadPlayerData`, ~190 `savePlayerData`** (68 saves in `app.js` alone).

---

## 🏛️ Historical Context (the organic-growth story)

The flat-file model was perfectly reasonable at 171 KB (note the CLAUDE.md async/await warning still says "Should be ~170KB"). The bot grew to 165 guilds; the file grew 20×; the access pattern never changed. A request-scoped cache was bolted on to dampen repeated reads within one interaction — then partly defeated by clearing it on every save. This is the winter-coat-in-the-kitchen pattern: each individual decision made sense at the time, but the accumulated result is that a one-field change rewrites 3.65 MB and blocks the event loop for ~60 ms.

---

## 🔬 The Three Pathologies (priority order)

### 1. The request cache is cleared on every save — and the clear is pure waste 🔴
`storage.js` clears the cache at interaction start (`app.js:2490`) **and again on every successful save** (`onSaved: () => requestCache.clear()`). But `loadPlayerData()` returns the **same object reference** callers mutate and pass back to `savePlayerData()` — so post-save the cache is *already* correct. Clearing it forces the **next** `loadPlayerData()` in the same interaction to re-read + re-parse 3.65 MB (another ~53 ms). A `load → save → load → save` handler pays the 34 ms parse penalty repeatedly instead of once. `safariManager.js` has the identical `onSaved: () => safariRequestCache.clear()`.

### 2. Pretty-printing wastes 38% of every file 🟡
`JSON.stringify(data, null, 2)` pushes 1.46 MB of whitespace through stringify, disk, and rename on every write. These `.json` files are gitignored and never human-diffed — the indentation buys nothing.

### 3. Write-on-read 🟡
`getReactionMapping()` (`storage.js:593`) bumps a `lastAccessed` timestamp and **writes the entire 3.65 MB file on a read**. Reading a mapping should never trigger a multi-megabyte write.

---

## 🧩 Incidental Findings (not the main event)

- **The "request-scoped" cache is a global singleton.** It's a module-level `Map` cleared at interaction start — not truly per-request. Because interactions interleave at `await` points on Node's single thread, two concurrent interactions share and can clobber each other's cache. Pre-existing latent race; the correct fix is `AsyncLocalStorage`. Removing clear-on-save does **not** worsen this.
- **`app.js` is 2.29 MB / ~41,000 lines** vs its own <5,000 target. Maintainability tax, *not* a runtime cost — keep it a separate problem.
- **Saves inside loops** (`safariManager.js:6161`, role-add loops in `app.js`) can do N full-file writes for one logical operation.
- **`forceFresh: true`** (`safariManager.js:1660`) deliberately nukes the cache for a fresh read — legitimate, but expensive at this file size.
- **Stale disk artifacts**: `*.json.backup`, `safariContent.json.pre-restore-*` (693 KB), `temp/` images — housekeeping only.

---

## 💡 Recommended Solution (tiered by effort/risk)

### 🥇 #1 — Stop clearing the request cache on save *(best bang-for-buck, ~2 lines, near-zero risk)*
Remove `requestCache.clear()` from `savePlayerData`'s `onSaved` (and the safari equivalent). Turns "N parses + N stringifies per interaction" into "1 parse + N stringifies."

**Why it's safe:** the cache is already request-scoped (cleared at interaction start) and the saved object *is* the cached object, so the cache stays consistent after a mutate-then-save.

**The one caveat:** on a *rejected/failed* atomic save, the in-memory cache would briefly lead disk for the remainder of that single request (self-heals at the next interaction's clear). Mitigation: keep the clear **only on the rejection path**, drop it on success.

### 🥈 #2 — Drop pretty-printing on data files 🟡
Compact JSON → instantly −38% file size, faster writes, less GC garbage. Trivial. (Files are gitignored; nothing human-diffs them.)

### 🥉 #3 — Kill the write-on-read in `getReactionMapping` 🟡
Don't persist `lastAccessed` on read, or debounce it.

### 🏗️ The real structural fix — per-guild persistence *(medium effort, do later)*
Most interactions touch exactly one guild; the biggest guild is 0.42 MB. Splitting `playerData.json` into per-guild files (or adding a write-back/dirty-flag layer) means a write stringifies/persists ~5× less and one guild's traffic never blocks another's. #1–#3 are the bridge; this is the destination.

---

## ⚠️ Risk Assessment

| Change | Risk | Notes |
|---|---|---|
| #1 cache clear removal | **Low** | Behavior change only on the rare failed-save path; gate the clear to rejection. Add a test that asserts a second `loadPlayerData` in one request is a cache hit. |
| #2 compact JSON | **Low** | Verify `atomicSave` `minSize` thresholds still pass (compact file is smaller — 2.25 MB still ≫ 50 KB floor). |
| #3 write-on-read | **Low** | `lastAccessed` appears informational; confirm nothing reads it for logic. |
| Per-guild split | **Medium–High** | Touches 377 load + 190 save sites; do behind the existing `loadPlayerData(guildId)` API so call sites are largely unchanged. Migration + dual-read fallback needed. |

---

## 📊 Flow: Current vs Proposed

```mermaid
flowchart TD
    subgraph CURRENT["🔴 Current — per interaction"]
        A1[Interaction starts] --> A2[clearRequestCache]
        A2 --> A3[loadPlayerData: read 3.65MB + parse 34ms]
        A3 --> A4[mutate one field]
        A4 --> A5[savePlayerData: stringify 29ms + write 3.65MB]
        A5 --> A6[onSaved clears cache 🔴]
        A6 --> A7[next loadPlayerData re-reads + re-parses 53ms 🔴]
        A7 --> A8[mutate + save again...]
    end

    subgraph PROPOSED["🟢 Proposed — #1 + #2"]
        B1[Interaction starts] --> B2[clearRequestCache]
        B2 --> B3[loadPlayerData: read + parse ONCE]
        B3 --> B4[mutate field]
        B4 --> B5[savePlayerData: compact stringify + write 2.25MB]
        B5 --> B6[cache kept ✅ - already consistent]
        B6 --> B7[next loadPlayerData = cache hit, 0ms ✅]
    end
```

---

## ✅ Definition of Done (when implemented)

- [ ] `onSaved` no longer clears cache on successful save (storage.js + safariManager.js)
- [ ] Data files written compact (no `null, 2`)
- [ ] `getReactionMapping` no longer writes on read
- [ ] Unit test: two `loadPlayerData` calls in one request → second is a cache hit
- [ ] Verified in TEST: cache-hit/miss log counts drop, no data-consistency regressions
- [ ] (Future) per-guild storage tracked as its own RaP/implementation doc
