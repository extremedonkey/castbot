# Community Challenge Library — Cross-Server Sharing & Discovery

> **RaP #0944** | 2026-03-16
> **Status**: Specification — design complete, ready to build
> **Related**: [Challenges RaP](0945_20260316_Challenges_Analysis.md), [Season Planner RaP](0947_20260315_SeasonPlanner_Analysis.md)
> **Depends on**: Challenges MVP (built), richCardUI.js (built), Cast Ranking system (for rating pattern)

---

## 1. Vision

The Challenge Library is CastBot's first **cross-server feature**. Hosts publish their challenges to a shared library; other hosts browse, preview, rate, and import copies to their own servers.

Think Steam Workshop for ORG challenges — a community marketplace that creates a network effect: more servers → more published challenges → more value for everyone.

---

## 2. Storage Architecture

### Decision: `challengeLibrary.json`

Evaluated options:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **`challengeLibrary.json`** | Consistent pattern, simple, fast, atomicSave | Single file, no CDN | **✅ MVP** |
| Discord server as DB | Built-in CDN, reactions for ratings | Rate limits, slow search, complex queries | ❌ Too slow |
| SQLite | Proper queries, scalable | New dependency, migration path | ❌ Overkill for MVP |
| GitHub repo | Version controlled, transparent | Rate limits, complexity | ❌ Wrong tool |

**Size estimate:** 100 challenges × 2KB = 200KB. Even 1000 challenges = 2MB. Well within manageable range. Same tier as `safariContent.json`.

**File management:**
- `atomicSave()` for writes (same as all data files)
- Add to backup service as **Tier 2** (important, regenerable)
- Add to `.gitignore` + `git rm --cached`
- Concurrent writes: publishing is rare (not real-time), atomicSave handles the rest

### Data Model

```javascript
// challengeLibrary.json
{
  "tpl_a1b2c3d4e5f6": {
    // Content (copied from challenge entity)
    "title": "Tycoons of the Nile",
    "description": "Build your trading empire along the Nile...",
    "image": "https://i.ibb.co/...",       // External host recommended
    "accentColor": 14502932,

    // Author metadata
    "author": {
      "userId": "391415444084490240",
      "username": "Reece",
      "serverName": "CastBot",
      "serverId": "1331657596087566398"
    },

    // Discovery metadata
    "tags": ["economic", "strategy"],       // From checkbox group on publish
    "playerCount": { "min": 8, "max": 24 },
    "estimatedRounds": 3,

    // Library metadata
    "publishedAt": 1773571822000,
    "importCount": 42,
    "sourceVersion": 1,                     // Increments on republish
    "unpublished": false,                   // Soft delete

    // Ratings (cast ranking pattern)
    "ratings": {
      "average": 4.2,
      "count": 15,
      "votes": {                            // Per-user, prevents double-voting
        "391415444084490240": 5,
        "572291395365109770": 4,
        "468655730975703041": 3
      }
    },

    // Future: action templates
    "actionTemplates": []                   // Phase 4: bundled Custom Action configs
  }
}
```

---

## 3. Publishing Flow

### Entry Point

Challenge Screen → select challenge → **📤 Publish to Library** button (new, next to Post to Channel)

### Publish Modal (3 components)

```
Label + Checkbox Group: Tags
  □ Economic / Trading    □ Physical / Endurance
  □ Social / Persuasion   □ Creative / Building
  □ Trivia / Knowledge    □ Puzzle / Logic
  □ Team-based           □ Individual

Label + TextInput: Player Count Range
  Placeholder: "8-24"
  Description: "Recommended number of players"

Label + TextInput: Estimated Rounds
  Placeholder: "3"
  Description: "How many rounds does this challenge span?"
```

### On Submit

1. Copy challenge data (title, description, image, accentColor)
2. Resolve author info (username, server name from Discord)
3. Generate template ID (`tpl_${crypto.randomUUID().substring(0, 12)}`)
4. Write to `challengeLibrary.json`
5. Show confirmation: "Published! Your challenge is now available to X servers."

### Republishing

If the source challenge already has a `libraryTemplateId`, offer "Update Published Version" instead. Creates a new version (increments `sourceVersion`), old version stays accessible but shows "Updated version available."

### Unpublishing

- **📤 Unpublish** button appears on challenges you've published
- Sets `unpublished: true` — hidden from browse/search
- Imported copies on other servers are NOT affected (they're independent copies)
- Only the original author or a CastBot admin can unpublish

---

## 4. Browsing & Discovery

### Entry Point

Challenge Screen → **📚 Challenge Library** button (in the action row, alongside Edit, Round, Post, Delete)

### Library Home Screen

The home screen should feel like a **storefront** — not just a string select. Show featured content to pique interest.

```
# 📚 Challenge Library
-# Discover and share challenges with the community

### 🌟 Featured
[Section with TextDisplay showing a curated/top challenge preview + thumbnail]

[String Select:
  🔍 Search Library
  🏆 Most Imported
  ⭐ Highest Rated
  🆕 Recently Published
  ───────────────────
  [Top challenges by import count, max 20]
]

📤 Publish Your Own | ← Back to Challenges
```

**Featured Challenge Logic:**
- Show the highest-rated challenge that was published in the last 30 days
- Fallback: highest import count overall
- Display as a Section with challenge title, author, import count, and star rating
- Rotate on each view (pick randomly from top 5)

### Category Browse

When a category is selected (Most Imported / Highest Rated / Recently Published):

```
## 📚 Challenge Library — Most Imported

[String Select:
  🔙 Back to Library
  🔍 Search
  ───────────────────
  1. Tycoons of the Nile (42 imports, ⭐4.8)
  2. Democracy (98 imports, ⭐4.6)
  ...up to 23 challenges
]

[Selected challenge preview — richCard]
📥 Import | ⭐ Rate | ← Back
```

### Search

🔍 Search → modal with search term → filtered results in string select. Searches title, description, tags, and author name.

---

## 5. Import Flow

### On Import

1. User clicks **📥 Import** on a library challenge
2. Copy all content fields to a new challenge in their server's `challenges` object
3. Set `importedFrom: { templateId, author, importedAt }`
4. Increment `importCount` on the library entry
5. Show confirmation: "Imported! Challenge added to your server."
6. Optionally link to a round immediately

### What's Copied

- Title, description, image URL, accent color
- Tags (for reference)
- `importedFrom` metadata (credit to original author)

### What's NOT Copied

- Author's userId/serverId (they're the author, not your host)
- Round links (those are server-specific)
- Ratings (those belong to the library entry)

### Image Constraint

⚠️ **Known limitation:** Discord CDN URLs are tied to the server/channel that uploaded them. If the original server deletes the source message/channel, imported image URLs may break.

**Mitigation for MVP:** Note in the publish UI: "For best results, use an external image host like ibb.co"

**Future mitigation:** Re-upload images to a CastBot-controlled Discord channel on publish, replacing the URL with a permanent one.

---

## 6. Rating System

### Pattern: Cast Ranking Style

Follow the existing cast ranking system — interactive star buttons with per-user voting.

### UI (on selected library challenge)

```
### ⭐ Rating
Average: 4.2/5.0 (15 votes)

[ActionRow: ⭐1 | ⭐2 | ⭐3 | ⭐4 | ⭐5]

-# Your vote: ⭐⭐⭐⭐ (4/5)
```

### Data

```javascript
ratings: {
  average: 4.2,          // Recalculated on each vote
  count: 15,
  votes: {
    "userId": 5,         // 1-5 star rating per user
    "userId2": 4,
  }
}
```

### Voting Rules

- One vote per user per challenge (updates if they vote again)
- Can't rate your own published challenges
- Average recalculated on each vote: `sum(votes) / count(votes)`
- Minimum 3 votes before showing average (prevents single 5-star skew)

### Display in String Select

Challenges in the browse list show their rating:
```
Tycoons of the Nile — 42 imports · ⭐4.8 (15 votes)
```

---

## 7. Leaderboards

### Primary: Interactive Discord UI

The main leaderboard is a Components V2 screen, not a Sharp image:

```
## 🏆 Challenge Library — Leaderboard

### Most Imported
1. 🥇 Tycoons of the Nile — 142 imports (by Reece)
2. 🥈 Democracy — 98 imports (by Kayl)
3. 🥉 Forbidden Island — 87 imports (by Anthony)
4. Verbal Jigsaw — 65 imports (by Britt)
5. Stacking Challenge — 52 imports (by Cat)

### Top Creators
1. Reece (CastBot) — 12 challenges, 487 total imports
2. Kayl (Servivorg) — 8 challenges, 312 total imports
3. Anthony (LOSTVivor) — 6 challenges, 198 total imports

← Back to Library
```

### Supplementary: Sharp Image

A **📊 Leaderboard Image** button generates a Sharp PNG for sharing — same pattern as schedule images. This is supplementary to the interactive UI, not a replacement.

---

## 8. Implementation Phases

### Phase 1: Publish + Browse + Import (MVP)

1. Create `challengeLibrary.json` with atomicSave, gitignore, backup
2. **📤 Publish** button on challenge screen → publish modal (tags, player count)
3. **📚 Challenge Library** button on challenge screen → library home
4. Featured challenge on home screen
5. Browse by category (Most Imported, Recently Published)
6. **📥 Import** → copy to server's challenges
7. **Unpublish** for authors

### Phase 2: Search + Ratings

1. 🔍 Search modal → filtered results
2. ⭐ Rating buttons (1-5 stars, cast ranking pattern)
3. Rating display in browse and detail views
4. "Highest Rated" browse category
5. Minimum vote threshold for average display

### Phase 3: Leaderboards + Polish

1. Interactive leaderboard screen (Most Imported, Top Creators)
2. Sharp image leaderboard for sharing
3. Author profiles (published count, total imports)
4. "Updated version available" notifications for imported challenges
5. Republish/versioning flow

### Phase 4: Action Templates (Future)

1. Bundle Custom Action configurations with published challenges
2. Import creates both challenge + linked actions
3. "Playable challenge" vs "content-only challenge" distinction
4. Template validation (actions reference valid outcome types)

---

## 9. UX Considerations

### The "Storefront" Feel

The library home should NOT feel like another entity management screen. It should feel like browsing a store:
- Featured challenge with preview (image if available)
- Categories with clear sorting
- Import count and ratings visible at a glance
- Author credit prominent

### Cross-Server Social

This is CastBot's first community feature. Lean into it:
- "Published by Reece from CastBot" — server name gives social proof
- Import counts create FOMO ("42 servers are using this")
- Ratings create trust signals
- Top creators get recognition

### Privacy

- Publishing is opt-in (explicit button)
- Only challenge content is shared (not player data, round data, or server config)
- Author can unpublish anytime
- Importing server gets an independent copy (no ongoing connection)

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| `challengeLibrary.json` grows large | Low | 1000 challenges = 2MB. Prune unpublished after 90 days |
| Discord CDN images break after import | Medium | Recommend external hosts (ibb.co). Future: re-upload on publish |
| Spam/abuse in published challenges | Medium | Unpublish + future: report button, admin moderation |
| Concurrent writes from multiple servers | Low | atomicSave handles file-level locking |
| Rating manipulation (self-voting) | Low | Block voting on own challenges. Future: vote weight by server activity |
| Single point of failure (one file) | Low | Backup service, Tier 2. Regenerable from published challenges |

---

## 11. Technical Notes

### New Files

- `challengeLibrary.json` — shared library data (gitignored, backed up)
- No new modules needed — extend `challengeManager.js` with library functions

### Backup Classification

**Tier 2** (important): Discord backup, regenerable if authors republish. Not critical like playerData (Tier 1) since all data originates from guild-level challenges.

### API Considerations

No external APIs needed. Everything is local file I/O. Discord API only used for resolving author usernames/server names at publish time.

### Component Budget

Library home screen: ~12-15 components (title, featured section, select, buttons). Challenge detail: ~20 components (preview, rating buttons, action buttons). Well within 40 limit.
