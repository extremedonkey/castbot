# Structured Do Not Cast (DNC) System — Analysis & Recommendations

## Original Context

> The problem / issue with DNC lists is: Pre-castbot, it's really really a free text field, dumped in the channel by the applicant, impossible to do anything programmatically. Some hosts literally never actually cross reference the lists - I've seen sworn enemies cast together which has blown up seasons / games and weeks of planning. CastBot now captures the input but it's mashed-together free text. We want structured entries with matching logic so CastBot can warn hosts during Cast Ranking when conflicts exist.

## 🤔 The Problem

**Current state**: DNC is a single free-text string (`dncList: "randocharmando\nitsjasondeez"`). Hosts must manually cross-reference during casting — and many don't. Result: sworn enemies get cast together, seasons blow up.

**Goal**: Structured DNC entries that CastBot can programmatically match against other applicants, surfacing warnings in Cast Ranking so hosts can't accidentally miss conflicts.

### Why This Is Hard

1. **Identity is messy** — Players have display names, server nicknames, global names, and usernames. None reliably match. Reece is `@extremedonkey` but everyone calls him Reece.
2. **Players may not be in the server yet** — ORGs start fresh servers. Day 1 applicants list someone who joins day 15. User Select only searches current server members.
3. **Modal limits** — 5 components max. Need to fit: name, username, user select, issues.
4. **Matching is fuzzy** — "rando" could mean "randocharmando". Exact matching will miss things, fuzzy matching will false-positive.

## 📊 Proposed Data Structure

### DNC Entry (per person listed)

```javascript
// playerData[guildId].applications[channelId].dncEntries[]
{
  id: "dnc_a1b2c3d4",           // Unique entry ID
  name: "Rando",                // Free-text name (required) — how the applicant knows them
  username: "randocharmando",   // Discord username (optional) — exact match target
  userId: "123456789012345678", // Discord user ID (optional) — from User Select, strongest match
  issues: "Metagamed me in S4", // Free-text explanation (optional)
  createdAt: 1774359221183
}
```

### Migration from flat string

```javascript
// OLD
{ dncList: "randocharmando\nitsjasondeez" }

// NEW (coexist during migration — check dncEntries first, fall back to dncList)
{
  dncList: "randocharmando\nitsjasondeez",  // Keep for backwards compat
  dncEntries: [
    { id: "dnc_001", name: "randocharmando", username: "", userId: null, issues: "", createdAt: ... },
    { id: "dnc_002", name: "itsjasondeez", username: "", userId: null, issues: "", createdAt: ... }
  ]
}
```

## 🎯 UI Design

### Player Application — DNC Question View

```
┌─────────────────────────────────────────────────────┐
│ ## Q8. Do Not Cast List                              │
│                                                      │
│ Is there anyone in the community that you will not   │
│ play with?                                           │
├──────────────────────────────────────────────────────┤
│ [StringSelect: Your DNC List (2 entries)]            │
│  ├─ 1. 🚷 Rando — "Metagamed me"        [summary]  │
│  ├─ 2. 🚷 Jason — "Toxic asf"           [summary]  │
│  └─ ➕ Add person to DNC list                        │
├──────────────────────────────────────────────────────┤
│ -# Your DNC list is confidential — only hosts see it│
│                                         [Next ▶]    │
└─────────────────────────────────────────────────────┘
```

**Selecting an existing entry** → reopens the modal pre-filled for editing
**Selecting "Add person"** → opens blank modal
**Selecting "summary"** (default) → no action, shows current state

### DNC Entry Modal (4 components, fits in 5-component limit)

```
┌──────────────────────────────────────┐
│         Add to DNC List              │
├──────────────────────────────────────┤
│ Name *                               │
│ [What do you know them as?        ]  │
│ -# Their display name, nickname, etc │
├──────────────────────────────────────┤
│ Discord Username                     │
│ [e.g. extremedonkey              ]   │
│ -# Exact Discord username (without @)│
│ -# for accurate matching             │
├──────────────────────────────────────┤
│ Search for User                      │
│ [🔍 Select user if in this server]   │
│ -# Optional — only works if they're  │
│ -# already in this server            │
├──────────────────────────────────────┤
│ What issues have you had?            │
│ [                                 ]  │
│ [                                 ]  │
│ -# Briefly describe past problems    │
└──────────────────────────────────────┘
```

**Component breakdown** (4/5 used):
1. **Label + Text Input**: Name (required, short, max 100)
2. **Label + Text Input**: Discord Username (optional, short, max 50)
3. **Label + User Select**: Search for user (optional, max 1)
4. **Label + Text Input**: Issues (optional, paragraph, max 500)

### Cast Ranking — DNC Warning Integration

```
┌─────────────────────────────────────────────────────┐
│ Cast Ranking - Current Season                        │
│ 🔍 Jump to applicant...                              │
├──────────────────────────────────────────────────────┤
│ ⚠️ @Lego has listed @Rando on their DNC list         │
│ ⚠️ @Jason has listed @Lego on their DNC list          │
├──────────────────────────────────────────────────────┤
│ > Applicant 3 of 6                                   │
│ **Name:** @Lego                                      │
│ **Average Score:** No scores                         │
│ **Casting Status:** ⚪ Undecided                     │
│ **App:** #📝lego-app                                 │
│ **DNC — Names:** Rando, Jason                        │
│ **DNC — Issues:** Rando metagamed me; Jason is toxic │
└─────────────────────────────────────────────────────┘
```

**Warning logic (for the current applicant being viewed):**
- `⚠️ @CurrentApplicant has listed @OtherApplicant on their DNC` — current applicant doesn't want to play with someone else who applied
- `⚠️ @OtherApplicant has listed @CurrentApplicant on their DNC` — someone else doesn't want to play with the current applicant
- `⚠️ @A and @B have each other on their DNC lists` — mutual conflict
- One warning line per match. Multiple matches = multiple lines.
- Only show warnings for applicants who are in the SAME season's application pool

## 🔍 Matching Strategy

**Three tiers of matching, in order of confidence:**

### Tier 1: User ID Match (Definitive)
If both the DNC entry and the other applicant have a Discord user ID → exact match.
```javascript
dncEntry.userId === otherApplicant.userId
```
**When this works**: User Select was used, or the applicant is in the server.

### Tier 2: Username Match (High confidence)
If the DNC entry has a username → case-insensitive exact match against other applicants' usernames.
```javascript
dncEntry.username?.toLowerCase() === otherApplicant.username?.toLowerCase()
```
**When this works**: Applicant provided the exact Discord username.

### Tier 3: Name Match (Fuzzy, flag but don't auto-confirm)
If only a name is provided → case-insensitive match against display names, global names, and nicknames.
```javascript
const nameMatch = [
  otherApplicant.displayName,
  otherApplicant.username,
  otherApplicant.globalName
].some(n => n?.toLowerCase().includes(dncEntry.name.toLowerCase()));
```
**Show as**: `⚠️ Possible match: @Lego listed "rando" — could be @randocharmando?`
**When this works**: Fuzzy but catches most cases. Host decides.

### Implementation Note

The matching runs at **Cast Ranking render time**, not at DNC save time. This way:
- Late joiners get matched retroactively
- No background jobs needed
- Fresh data every time the host views rankings

```javascript
function findDncConflicts(currentApplicant, allApplicants) {
  const conflicts = [];
  const currentEntries = currentApplicant.dncEntries || [];

  for (const other of allApplicants) {
    if (other.userId === currentApplicant.userId) continue;

    // Check: does current applicant have OTHER on their DNC?
    for (const entry of currentEntries) {
      const match = matchDncEntry(entry, other);
      if (match) conflicts.push({ type: 'listed_by_current', entry, other, confidence: match });
    }

    // Check: does OTHER have current applicant on their DNC?
    const otherEntries = other.dncEntries || [];
    for (const entry of otherEntries) {
      const match = matchDncEntry(entry, currentApplicant);
      if (match) conflicts.push({ type: 'listed_by_other', entry, other, confidence: match });
    }
  }

  return conflicts;
}
```

## 🔄 Reusable Module: PersonEntryManager

The "add a person with details via repeatable modal" pattern is reusable. Abstract it as:

```javascript
// personEntryManager.js — Reusable structured person entry UI
export function buildPersonEntryList(entries, options) {
  // Returns: string select with entries + "Add new" option
  // Each entry shows: emoji + name + truncated detail
  // Options: maxEntries, customId prefix, addLabel, editLabel
}

export function buildPersonEntryModal(entry, options) {
  // Returns: modal with Label-wrapped inputs
  // Fields configurable: which fields to show, required/optional, labels
  // Default fields: name, username, userSelect, freeText
}

export function handlePersonEntrySubmit(modalData, existingEntries) {
  // Parses modal submission, creates/updates entry
  // Returns updated entries array
}
```

**Future use cases:**
- Alliance tracking (who's working with who)
- Player notes (host notes on specific players)
- Reference lists (hosts recommending players to other hosts)
- Rivalry tracking (for season narrative purposes)

## ⚠️ Considerations

### Migration
- Existing `dncList` strings should continue to work
- When a player edits their DNC on the new system, migrate the flat string to structured entries
- Don't auto-migrate — let it happen naturally as players interact

### Component Budget
The DNC question view needs:
- TextDisplay (heading) = 1
- Separator = 1
- ActionRow + StringSelect (entry list) = 2
- TextDisplay (confidentiality note) = 1
- Section + accessory button (navigation) = 2
- **Total: ~7 components inside the Container**

With a max of ~10 entries in the select (each being 2 lines of label), we stay well within limits.

### Privacy
- DNC data is **confidential** — only hosts see it
- The matching warnings appear only in Cast Ranking (host-only interface)
- Players never see other players' DNC lists
- The User Select in the modal sends user IDs — this is fine, same as any other User Select interaction

### Entry Limits
- Suggest max **10 DNC entries per applicant** — enough for any reasonable list, prevents abuse
- Each entry: name max 100 chars, username max 50 chars, issues max 500 chars

### Edge Cases
- **Player edits DNC after already being cast** — DNC is captured at application time, cast ranking shows it, but there's no runtime enforcement. This is by design (hosts make the final call).
- **Mutual DNC** — Both A and B list each other. Show both warnings. Host sees the full picture.
- **DNC entry with no matches** — Just display the entry in the applicant's DNC section. No warning needed.
- **Applicant not yet in server** — Username match works. User ID match won't (they haven't joined). Name match is fuzzy but better than nothing.

## 💡 Recommendation

**Build in two phases:**

### Phase 1: Structured DNC Capture (Modal + Data)
1. New modal with 4 fields (name, username, user select, issues)
2. String select list view on the DNC question (like season planner pattern)
3. Add/edit/delete entries
4. Store as `dncEntries[]` array
5. Backwards-compatible with existing `dncList` string
6. `PersonEntryManager` as reusable module

### Phase 2: Cast Ranking Integration (Matching + Warnings)
1. `findDncConflicts()` matching function (3-tier)
2. Warning display in Cast Ranking UI
3. DNC summary fields on the applicant card
4. Test with real data from Epoch S13 applications

**Phase 1 is independent of Phase 2** — structured data capture is valuable even without automated matching (hosts can read the structured entries more easily than raw text).

## 📎 Related Documents

- [SeasonAppBuilder.md](../03-features/SeasonAppBuilder.md) — Season application system
- [CastRanking.md](../03-features/CastRanking.md) — Cast ranking feature
- [ComponentsV2.md](../standards/ComponentsV2.md) — Modal components (Labels, User Select, Text Input)
- [SeasonPlanner Analysis](0947_20260315_SeasonPlanner_Analysis.md) — String-select list UI pattern reference
