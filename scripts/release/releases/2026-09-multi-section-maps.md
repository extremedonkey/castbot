# :map: Multi-Section Maps — one Safari, as many maps as your season needs
-# Friday 19th September 2026
Credit to : @___

You planned a layered season — a starting island, a hidden second area, maybe an underworld for the endgame. Then you hit the wall every Safari host hits: CastBot supports **one map**. So you squeezed three zones onto one image, blacklisted the water between them, and hoped nobody noticed the volcano sharing a grid with the beach.

**Your Safari can have more than one map now.** :sparkles:

## :map: Drop a whole new map into a running season
> Usage: `/menu` → :lion_face: **Safari** → :map: **Map Explorer** → :map: **Add Section**

Upload a new image, pick rows and columns, choose where it sits — **right of** or **below** your current map — and CastBot builds the grid, the channels, and the fog of war in its own category. Your existing map is **never touched**: no channels renamed, no anchors reposted, nobody moved.

The new area's coordinates continue where yours end — a map ending at row 5 grows an `A6`, not a suspicious `R6` that tells your players something exists. Grid labels on the new image show the **real** coordinates, so `H3` on the section image is `H3` everywhere else.

And the walls are real. A player standing on the last row of map one gets **no South button** into map two. The *only* way across is a Teleport you place yourself — behind an item, a riddle answer, a merge announcement, whenever the story says so.

> One season, one economy, one inventory — stamina, currency and items carry across sections. Only the geography is separate.

## :arrow_backward::arrow_forward: Manage each map on its own
> Usage: `/menu` → :lion_face: **Safari** → :map: **Map Explorer** → **◀ ▶**

Map Explorer pages between your sections — each with its own image, its own blacklist tints, its own player markers. And the management buttons follow: **Update Map** replaces *this* section's art (and regenerates only its fog and anchors), **Delete** removes *this* section — channels, coordinates, the lot — while every other section and all your Actions stay put. Blacklist edits land you back on the section you were editing, not page one.

Deleting a section refuses while players are standing in it, and names them, so nobody gets stranded in a channel that no longer exists.

-# Paging takes a couple of seconds — CastBot re-renders the overlay each flip.

## :cyclone: Teleports finally *arrive*
Walking into a cell has always posted the arrival card — *"Reece has arrived at A2"* with a :map: **Navigate** button. Teleporting? Nothing. The player got a text link, landed in a silent channel, and that one player who never reads pinned messages sat there asking "where do I go now" in confessionals.

Teleported players now get **the exact same arrival card in the destination channel**, and their leftover compass back at the old cell flips to a tidy *"you have moved"* note. If you run silent navigate mode for an escape room, teleports respect that too — no card, no button, no spoilers.

## :straight_ruler: The 27th column works now
An awkward one to admit: you could always *create* a map wider than 26 columns — and movement quietly broke the moment a player reached column `AA`. Buttons pointed at nonsense, blacklists wouldn't take `AA5`, overlays drew in the wrong place.

Fixed everywhere — movement, teleports, blacklists, overlays, imports. If your idol hunt wants a 30-column coastline, build it.

## :lock: Looking at an action no longer moves it
Opening an existing action from a *different* location's context menu used to silently attach it to that location — and only half-attach it, so the button never even appeared for players. You'd find the phantom link weeks later and wonder which co-host did it.

Now **looking is just looking**. Creating a *new* action from a location still auto-assigns it there, exactly as before. To put an existing action somewhere new, do it on purpose:
> Usage: :zap: **Action Editor** → :round_pushpin: **Locations** → add the coordinate

```Try this```
Open :map: **Map Explorer**, hit :map: **Add Section**, and give your endgame its own island — then gate the only Teleport in behind the merge idol. Your players will never see it coming.
