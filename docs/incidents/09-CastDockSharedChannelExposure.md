# Incident 09 — CastDock in a Shared Channel: One Player's Menu, Public for Four Days

**Date reported**: 2026-08-08 · **Guild**: EpochORG S14: Empire of Mali (`1512093418602364998`)
**Severity**: Privacy (read-only exposure of one player's game state to their whole cohort)
**Status**: Guards shipped 2026-08-08. The affected dock was still live at time of writing.

## Original Context (Trigger Prompt)

> investigate prod, one player seeing another players menu server id 1512093418602364998
>
> Player 1187627604312862721 could see player 885136176883839026 stuff
>
> Emma — 12:25
> Hi yall, for some reason I can see this on the map explorer
> Image
> daddy ren — 12:30
> @Reece @An rich guy
> daddy ren — 12:32
> can you still see it?
> Reece — 12:32
> thats just the menu
> comes up when you type /menu
> Emma — 12:33
> It's gone, I could just see Mimi's info for some reason
> Reece — 12:33
> o

## 🤔 What actually happened

Not an identity bug. Not a cache leak. Nobody exploited anything.

**Mimi self-activated CastDock in a shared map channel.** CastDock pins a *public* card to a
channel showing one nominated player's stats, with buttons anyone present can press. It is
designed for a player's own subs/submission channel, where the only other people are hosts.
`#🏙️d3-timbuktu-main` is a map channel the whole cohort walks through.

Confirmed from `logs/user-analytics.log` and prod `playerData.json`:

| When | Who | What |
|---|---|---|
| Tue 4 Aug 08:56–08:57 | **Mimi** (`885136176883839026`) | `player_set_castdock` → `castdock_activate` in `#🏙️d3-timbuktu-main` |
| Tue 4 Aug 08:58 | Kevin A | `castdock_view_inventory` → read **Mimi's** inventory |
| Wed 5 / Thu 6 Aug | Kevin A, Andrew | `castdock_collapse` |
| **Sat 8 Aug 12:23** | **Emma** (`1187627604312862721`) | **`castdock_expand`** → the public card became **Mimi's full Player Menu** |
| Sat 8 Aug 12:25–12:26 | Emma | `player_set_castdock` ×2 → published **Emma's own** menu into the channel; then `castdock_collapse` → *"it's gone"* |
| Sat 8 Aug 12:31 | daddy ren | `castdock_view_inventory` → read **Mimi's** inventory |

`enabledBy` and `targetUserId` are both Mimi's ID — she did it to herself, and `disabledAt`
was still `null` four days later.

The ordering is what rules out the alternative theory: Emma's *first* CastDock event is
`expand`, with no preceding `collapse`, and her last menu open was 51 minutes earlier. She
clicked the `^` accessory on the public sticky, not anything inside her own menu.

## 🏛️ Why it was possible

Every individual behaviour was correct in isolation:

- `castdock_expand` / `collapse` / `view_inventory` / `view_navigate` resolve to
  `entry.targetUserId`, **ignoring the clicker** ([app.js:9883-9950](../../app.js)) — right for a
  subs channel, where a host reading the player's dock is the entire point. An ownership
  check here would break the feature, which is why one was never added.
- Activation was self-service with no channel-privacy condition.
- The setup screen *did* warn ([castDock.js:299-300](../../castDock.js)) — and the warning was read past.

The gap was placement, not authorization: nothing connected "this is public" to "and this
particular channel has 14 other players in it."

### Two genuine bugs found alongside it

1. **`⌄` in a bystander's private menu** — [playerManagement.js:1779](../../playerManagement.js) gated the
   collapse toggle on `channelId` alone, so *any* player running `/menu` in a CastDock
   channel got a button in their **private** menu that swapped in the dock target's data.
2. **Reverse leak** — bare `player_set_*` buttons on the expanded dock resolve to the
   *clicker* and `UPDATE_MESSAGE` the **public** sticky. Emma's own menu went public this way.

## 💡 The design lesson (this is the reusable part)

The setup screen already said, in `-#` small text:

> Since it's public now, whatever shows on it … is visible to everyone in this channel.
> Best kept to a private submission/subs channel …

Accurate, well written, ignored. And [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)
had **already diagnosed this exact failure mode**, on this exact screen, after the 2026-08-01
button-selection confusion:

> **Not a substitute**: a general disclaimer … CastBot had exactly that sentence on the screen
> the whole time. It was true, it was ignored, and it named no specific button — per-option
> feedback is what actually works.

Same screen, same failure, second time. **A warning the reader has to apply to their own
situation is a disclaimer. Compute the fact and state it.** The screen now counts the
non-admin, non-bot members who can see the channel and says
`14 other players can see this channel` — escalating the accent to orange and relabelling
the button **Activate Anyway** when that count is non-zero.

## 🛡️ Guards shipped (2026-08-08)

| # | Guard | Where |
|---|---|---|
| 1 | Computed audience count + orange escalation + "Activate Anyway" | `castDock.js` `assessCastDockAudience` / `countCastDockAudience` |
| 2 | `⌄` only on the dock owner's own menu | [playerManagement.js:1777](../../playerManagement.js) |
| 3 | `player_*` on someone else's sticky → ephemeral refusal, no public update | `castDock.js` `isForeignCastDockSticky`, dispatched in app.js |
| 4 | Refuse self-service retarget of a live dock (`allowRetarget` for hosts) | `castDock.js` `applyCastDockToggle` |
| 5 | `security:` made real — was inert on 19 call sites | `buttonHandlerFactory.js` `SECURITY_TIERS` |

Guard 5 is the structural one. `security: 'public'` had been decoration since incident 04
(its Recommendation 3 was proposed and never built), so handlers *read* as deliberately
gated while having no gate at all — it fooled an audit pass during this very investigation.
It is now enforced, additive (an absent tier changes nothing, so ~100 legacy handlers are
untouched), and a typo'd tier throws at wiring time.

Tests: `tests/castDockGuards.test.js`, `tests/securityTier.test.js`.

## ⚠️ Not done

- **The affected dock was still enabled** at `1519273936565833783` — disabling it is a prod
  data write and needs explicit sign-off.
- **No hard block** on self-activating in a shared channel. Guard 1 makes it informed rather
  than impossible, deliberately: hosts do legitimately run docks in odd places, and a hard
  block would have to guess which. Revisit if it recurs.

Related: [04-AnchorMenuAdminExposure](04-AnchorMenuAdminExposure.md) (same class: security
assumed rather than written) · [CastDock.md](../03-features/CastDock.md)
