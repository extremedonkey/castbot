# 0902 — Casting Lifecycle Chevron + Offer Stage + Status Definition Table

**Status:** 🟢 Shipped to PROD 2026-07-09. **⚠️ The original design below deviated during implementation — read
the "SHIPPED STATE" box first; the rest is design history.** Canonical current behaviour:
[SeasonManager.md → Casting](../03-features/SeasonManager.md#-casting-the-former-ranking-tab).
**Date:** 2026-07-09 · **Related:** RaP 0905 (status engine), 0906 (invites) · `playerStatus.js` · `castRankingManager.js`

---

## ✅ SHIPPED STATE (2026-07-09) — how it actually turned out

The design below proposed a **visible chevron replacing the ÜberStatus line**. In practice, over the same day:

- **Offer stage (Stage 2) — SHIPPED as designed.** `application.offerStatus` ∈ `offer` / `offer_alternative` /
  `offer_rejected` (renamed from `offer_declined`) + `offerSentAt`, stamped in `sendCastingInvites` on a
  successful send AND by the new **"Update Status Only"** single-invite mode (no send). `OFFER_FOR_STATUS`
  (castingStatus→offerStatus) is exported.
- **`accepted_alternative` placementResponse — SHIPPED as designed.**
- **The chevron — BUILT then HIDDEN.** `resolveCastingChevron` / `renderCastingChevron` / `getCastingChevron`
  live in `playerStatus.js` and are tested, but the render line on the Casting card is **commented out**
  (Reece's call — revivable in one line). Adaptive-terminal + spoiler rules are as designed.
- **ÜberStatus line — REMOVED from the card entirely** (the chevron briefly replaced it, then the chevron was
  hidden too). `getApplicationStatus`/`STATUS_REGISTRY` remain for `getPlayerSeasonStatus`/future consumers.
- **Tentative — REMOVED ENTIRELY** (not just "no offer"). `castingStatus` is now `cast`/`alternative`/`reject`/
  absent. The Stage-1 line below still lists Tentative — that is **design-time history, no longer true**.
- **Casting Decision UI — string select → three TOGGLE buttons** (`castdec_*`): 🎬 Cast (active=green) /
  🙅 Don't Cast (active=red) / 🔄 Alternate (active=blue); grey when inactive; click-active-to-clear.
- **Invites — bulk + single.** Bulk Invites moved to Marooning; a context-aware **Send Invite** button on the
  Casting card opens a single-applicant modal variant (Send Offer/Decline/Alternate + Update Status Only).
- **Status Definition Table — NOT built** (still deferred; `STATUS_REGISTRY` + `deriveApplicationStatus` remain
  the two hand-matched definitions).

Everything from here down is the **original design/analysis** (kept for the reasoning + the full trigger prompt).

---

## Trigger Prompt (full, unmodified)

> So below are some changes for our new status chevron tracker thing, PLUS some new status fields / changes.
>
> For the chevrons, show emoji of 'current status' when printing the following (not other statuses)
> Use ||Spoiler|| tags to hide yet-to-be-reached statuses
>
> ### Casting Status
> -# New App ▶ App Submission ▶ **`🎥 Casting Review`** ▷ ||Casting Offer|| ▷ ||Casting Accepted||
>
> // Mapping
> New App -> If Stage 0 / New
> App Complete -> If Stage 0 - Application Complete
> Casting Review -> IF status is NOT New App AND the app has ANY votes
> ??
> Casting Offer -> Realistically this is a new Stage 1.5 we need to add, please update the status print list in your next prompt, lets call this the new stage 2 and stage 2 becomes stage 3 etc. Statuses are offe
> ├─ 🦸 offer -> Invite has been sent to someone of castingStatus = cast
> ├─ 🕵️ offer_alternative or offerAlternative -> Invite has been sent to someone of castingStatus = alternative
> ├─ 🙅 offer_declined -> Invite decline sent to someone with castingStatus = reject
> // still need to think through tentative and declined
> // Consider any re-architecting of the Invite bulk or single sned functions
>
> Casting Accepted -> IF placementResponse = accepted, OR if declined show Casting Declined, also add a new placementResponse for like placementRespomnse = accepted_alternative
>
> Consider in our metadata schema we may need to maintain almost a definition table / mapping of each string for use in different contexts..
>
> ultrathink

---

## The four moving parts

1. **New Stage 2 — "Offer Sent"** (renumbers old placement Stage 2 → Stage 3). A new stored field
   `offerStatus` on the application record, written when an invite is actually SENT.
2. **`accepted_alternative`** — a new `placementResponse` value (player accepts an *alternate* spot).
3. **The chevron renderer** — a one-line public-journey progress bar (5 segments), current-only emoji,
   spoilered future.
4. **A Status Definition Table** — single source of truth mapping each canonical status → its per-context
   projections (ÜberStatus label, chevron segment, jump-select icon, Marooning group…). Today those live in
   TWO byte-matched-by-hand definitions (`STATUS_REGISTRY` + `deriveApplicationStatus`); the chevron is a 3rd.

## Design principle: chevron tracks lifecycle EVENTS, not the private draft (admin-facing only)

Correction (Reece): the chevron is **admin/host-facing only — NOT shown to applicants**. So the earlier
"public journey" rationale was wrong. The real reason the private casting draft (Cast/Alt/Tentative/Not-Cast,
Stage 1) does **not** advance the chevron is simpler: the chevron tracks lifecycle **events** on a timeline —
submitted, reviewed, **offer sent**, responded. An internal draft decision isn't an event on that timeline;
*sending the offer* is. So the chevron sits at **Casting Review** until `offerStatus` is set.

Decision (locked): the chevron **REPLACES** the 🌈 ÜberStatus line on the Casting card. The private draft
decision is still visible/settable via the 🎭 Casting Status select section below, so nothing is lost.
`getApplicationStatus`/`STATUS_REGISTRY` remain (untouched) for `getPlayerSeasonStatus` + future consumers.

## Updated status hierarchy (new Offer stage, renumbered)

```
├─ ✖️ OVERRIDE: Withdrawn (live channel "✖️")
├─ 🏁 STAGE 3 — Placement response (the PLAYER responds)              [was Stage 2]
│   ├─ 🎉 Accepted Placement        placementResponse='accepted'
│   ├─ ✅ Accepted (Alternate)      placementResponse='accepted_alternative'   [NEW]
│   └─ 🚫 Declined Placement        placementResponse='declined'
├─ ✉️ STAGE 2 — Offer sent (the ADMIN sent the invite)               [NEW]
│   ├─ 🦸 Offer Sent (Cast)         offerStatus='offer'
│   ├─ 🕵️ Alternate Offer Sent      offerStatus='offer_alternative'
│   └─ 🙅 Rejection Sent            offerStatus='offer_rejected'   (⚠ naming: was 'offer_declined')
│         └─ tentative: NO offer — tentative applicants are never messaged (selectInviteTargets skips them)
├─ 🎬 STAGE 1 — Casting decision (ADMIN private draft)               Cast/Alt/Tentative/Not-Cast/Undecided
├─ 🗳️ STAGE 0.5 — Votes (Reviewed/Scoring/Awaiting)                  [legacy Status: line only]
└─ 📋 STAGE 0 — Lifecycle                                            Application Complete / New
```
Precedence: Stage 3 > Stage 2 > Stage 1 > Stage 0.5 > Stage 0; Withdrawn overrides all. Because `offerStatus`
encodes the decision (offer=cast, offer_alternative=alt, offer_rejected=reject), Stage 2 can outrank Stage 1
without losing information.

## The chevron: format + mapping

**Format rules (from prompt):** current segment ONLY gets an emoji, rendered as a bold code-chip
`` **`🎥 Casting Review`** ``. Reached segments = plain text. Future = `||spoiler||`. Separators: `▶`
between reached/current, `▷` into the spoilered future.

**5 segments & the resolved-status → position map:**

| # | Segment | Reached when |
|---|---|---|
| 1 | New App | status = New |
| 2 | App Submission | Application Complete |
| 3 | Casting Review | Complete **and** ≥1 vote (private Cast/Alt/Tentative/Reject sit HERE — draft is invisible) |
| 4 | Casting Offer | offerStatus set (label/emoji adapt: 🦸 Offer / 🕵️ Alt Offer / 🙅 Not Cast) |
| 5 | Casting Accepted | placementResponse set (🎉 Accepted / ✅ Accepted-Alt / 🚫 Declined) |

**Negative/terminal branches (the "think through declined" part) — RECOMMEND "adaptive terminal":**
the current segment is the LAST rendered; terminal-negative states have no reachable future, so NO spoilers.
- Rejected (offer_rejected): `New App ▶ App Submission ▶ Casting Review ▶ **`🙅 Not Cast`**`
- Declined: `… ▶ Casting Offer ▶ **`🚫 Casting Declined`**`
- Withdrawn: replace the tail — `… ▶ **`✖️ Withdrawn`**`

## Storage + invite re-architecture (grounded)

- **New field** `application.offerStatus` ∈ {`offer`,`offer_alternative`,`offer_rejected`} (+ `offerSentAt` ISO).
- **Single write point:** `sendCastingInvites()` (castRankingManager.js:814) is the choke point for BOTH bulk
  and single ('selected') sends — stamp `offerStatus` per target from its `messageType`
  (successful→offer, alternative→offer_alternative, unsuccessful→offer_rejected) after a successful send.
  This is the entire "re-architecture" — no structural change, just persist the send.
- **`accepted_alternative`:** at app.js:5720 `offerType` ('successful'|'alternative') is already in scope →
  `placementResponse = accepted ? (offerType==='alternative' ? 'accepted_alternative' : 'accepted') : 'declined'`.

## Status Definition Table (proposed, incremental)

One `STATUS_DEFINITIONS` map, each entry carrying per-context projections:
```
{ id, stage, test(signals),
  emoji, label,              // ÜberStatus / Status: line
  chevron: { segment: 1..5, label, emoji, terminal?: bool },
  jumpIcon, marooningGroup } // future consumers
```
`STATUS_REGISTRY`, `deriveApplicationStatus`, the jump-select icons, and the chevron all become *consumers*
of this one table. **Do it incrementally:** add the table + chevron projection FIRST (new code, provable),
then later fold the two hand-matched definitions into it. No big-bang.

## Open decisions (need Reece)
1. `offer_declined` → rename to **`offer_rejected`**? (collides with placementResponse `declined` = player declined).
2. Negative-branch chevron: **adaptive terminal** (recommended) vs always-5-with-spoilers.
3. Chevron **supplements** ÜberStatus (recommended) vs replaces it.
4. Build scope this turn: full (offerStatus + invite stamp + accepted_alternative + ÜberStatus rows + chevron
   + definition table) vs core-first (chevron + offerStatus, defer the definition-table refactor) vs design-only.
5. tentative: confirm "no offer, stays at Casting Review" (recommended) — or a future tentative-offer message?
