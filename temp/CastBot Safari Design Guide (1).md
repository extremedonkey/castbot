\# CastBot Safari Design Guide



> \*\*What this is:\*\* a complete, self-contained guide for designing a CastBot Safari — an interactive

> Discord adventure (exploration map, escape room, idol hunt, economy game, etc.). It teaches you

> CastBot's \*real\* building blocks and constraints so the design you produce can actually be built,

> instead of a generic "escape room" that has to be re-invented from scratch.

>

> \*\*Who it's for:\*\* any LLM (Claude, ChatGPT, Gemini…) OR a human host. You can paste this entire

> document into a fresh chat and then describe the adventure you want; the assistant will turn it

> into a CastBot-native build spec. There is no code or jargon you need to know — just menus.

>

> \*\*The one rule:\*\* \*Do not invent mechanics CastBot doesn't have.\* If a cool idea doesn't map onto

> the building blocks below, either translate it into something that does, or flag it and propose the

> closest CastBot-native substitute. Never silently assume a capability exists. This is the single

> most common failure mode, and it's what this guide exists to prevent.



\---



\## 1. What a CastBot Safari actually is



A Safari is built entirely \*\*inside a Discord server\*\*, out of these realities:



\- \*\*A grid map = real Discord channels.\*\* If you use the map, every cell (e.g. `A1`, `B2`) becomes a

&#x20; real text channel. Players physically \*move\* between \*\*adjacent\*\* cells, and they can only see the

&#x20; channel for the cell they're currently standing in (fog of war).

\- \*\*Everything interactive is a "button."\*\* Players click buttons (or type commands, or enter codes).

&#x20; Each button is an \*\*Action\*\* that runs a list of \*\*Outcomes\*\* (show text, give an item, take

&#x20; currency, unlock a door, fight an enemy, jump to another room…).

\- \*\*Player state is tiny and explicit.\*\* CastBot only remembers a handful of things about a player

&#x20; (see §3). Every puzzle, gate, and bit of progress must be expressed in terms of those things.

\- \*\*The host builds it by clicking menus\*\* (`/menu` → 🦁 Safari → …). No coding. So a good design is

&#x20; one that maps cleanly onto those menus.



That's it. A Safari is: a (optional) grid of channels + items + buttons-that-do-things + a little bit

of remembered state. Rich adventures come from \*combining\* these, not from special features.



\---



\## 2. The Golden Constraints (read before designing)



These are the hard edges. A design that violates them cannot be built as written.



\*\*Map\*\*

\- The map is a \*\*rectangular grid\*\*, not a free-form web of rooms. Max \*\*400 cells total\*\* (e.g. 20×20).

\- \*\*Columns are single letters A–Z\*\* (so \*\*max 26 columns wide\*\*). Rows are numbers (`A1`, `B7`…).

\- Movement is to \*\*adjacent cells only\*\* — the 8 neighbours (default) or 4 (N/E/S/W). A player cannot

&#x20; jump from one room to a distant one \*by walking\*. (Teleports exist — see "secret passage" in §7.)

\- \*\*One Discord channel per cell.\*\* Big maps eat hundreds of channels (Discord caps a server at 500).

\- \*\*A map cannot be resized after it's created\*\* — changing the grid means deleting and rebuilding

&#x20; (which wipes player progress). Decide dimensions up front.

\- A map \*image\* (the picture behind the grid) must be a Discord-hosted image URL.



\*\*Items\*\*

\- Items have a \*\*name + an emoji\*\* for their icon. \*\*Items cannot have a custom image.\*\* (Images can

&#x20; appear in \*room descriptions\* or in an Action's "display text", just not on the item itself.)

\- Max \~200 items per server. Name ≤ 80 chars, description ≤ 500.



\*\*Rooms unlock via items — but two steps are mandatory.\*\* To make "this door needs the Brass Key":

&#x20; 1. \*\*Blacklist\*\* the cell(s) behind the door (blocks everyone), AND

&#x20; 2. put those same cells on the Brass Key item's \*\*Reverse Blacklist\*\* list (holders pass).

&#x20; Do only step 1 → nobody can ever enter. Do only step 2 → \*everybody\* can enter (the item does

&#x20; nothing). You need both. Holding \*\*1\*\* of the item is enough (quantity doesn't matter), and the

&#x20; unlock applies to \*\*every\*\* player who holds it (it's not per-player-customised). And remember: the

&#x20; unlocked cell must still be \*\*adjacent\*\* to somewhere the player can already reach.



\*\*Actions / interactions\*\*

\- An Action runs \*\*at most 6 outcomes\*\*. Action text ≤ 2000 chars. ≤ 100 Actions per server.

\- There is \*\*no free-form "use item X on object Y"\*\*. Players interact by clicking buttons you placed,

&#x20; typing command phrases, or entering codes — all pre-defined. You cannot let them combine arbitrary

&#x20; things; combination is done through \*\*Crafting recipes\*\* (§6) or \*\*conditions\*\* (§5).

\- \*\*No arbitrary memory.\*\* CastBot can't remember "the player examined the painting" unless you record

&#x20; it as one of the five state things (§3) — usually by giving them an invisible \*\*flag item\*\*.



\*\*Crafting\*\*

\- A crafting recipe's menu entry shows \*\*only the recipe's name\*\* — \*not\* what it consumes or produces.

&#x20; So the \*\*name must tell the player what it needs\*\* (e.g. "Disguise (needs Apron + Wine)").



\*\*Timing\*\*

\- The only built-in timer is the \*\*Challenge timer\*\*: a stopwatch that records how long a player takes,

&#x20; with a "Stop Timer" button. There is no per-puzzle countdown that locks players out.



\---



\## 3. The mental model that makes everything work



\### 3a. Player state is only these things



CastBot remembers, per player:



| State | What it's for |

|---|---|

| \*\*Inventory\*\* (items + quantities) | keys, tools, clues, \*and flags\* (see below) |

| \*\*Currency\*\* (one number) | the economy; can never go below 0 |

| \*\*Attributes\*\* (stamina, + optional custom stats like HP) | pacing and gating |

| \*\*Current location\*\* (which cell) | where they are on the map |

| \*\*Usage claims\*\* (which one-time things they've already done) | "you already searched this" |

| \*\*Discord roles\*\* | team/tribe membership, perks, end states |



\*\*Every gate, puzzle, and piece of progress must reduce to a check on one of these.\*\* If your design

needs to "know" something about a player, ask: \*which of these six does it live in?\* If the answer

isn't obvious, you probably need a flag item.



\### 3b. Flag items — the master key to stateful design



A \*\*flag item\*\* is an ordinary item you create purely to represent \*progress or a fact\*, not a

physical object. Give it a name, set price 0, never put it in a store. Then:



\- \*\*To "remember" something happened:\*\* the Action gives the player the flag item (e.g.

&#x20; "Talked to Burr ✅", "Globe Solved 🌐").

\- \*\*To gate on it later:\*\* a condition checks \*has item "Globe Solved"\*.

\- \*\*To unlock a room with it:\*\* put the locked cells on the flag item's Reverse Blacklist.



This single trick converts almost any "the game should know that…" requirement into CastBot mechanics.

Information-gates become item-gates; "a new area becomes available" becomes "the player now holds an

item that reverse-blacklists that area."



\### 3c. Two ways to build a world — pick one (or blend)



| | \*\*Grid Map\*\* | \*\*Action Graph (no map)\*\* |

|---|---|---|

| \*\*What it is\*\* | Channels per cell; players walk between adjacent cells | "Rooms" are just messages; buttons jump you to the next room via \*follow-up\* outcomes |

| \*\*Best for\*\* | exploration, survival, idol hunts, anything where \*geography\* and \*movement\* matter | escape rooms, branching stories, puzzle boxes — anything that's a \*logic graph\*, not a place |

| \*\*Unlocking\*\* | blacklist + reverse-blacklist items; movement needs adjacency | conditions on buttons; show/hide the "next" button based on items held |

| \*\*Cost\*\* | many channels; fixed grid; movement/stamina pacing | almost no channels; total layout freedom |

| \*\*Downside\*\* | layout must fit a grid with adjacency | no real "map", no spatial feel, no fog of war |



\*\*Decision rule:\*\*

\- If the fun is \*moving around a place\* → \*\*Grid Map\*\*.

\- If the fun is \*solving a sequence/branch of puzzles\* and the "map" is really an access-graph (like a

&#x20; classic escape room) → \*\*Action Graph\*\* is often the cleaner fit.

\- \*\*Blend:\*\* a Grid Map for the world, with Action-Graph puzzles (codes, crafting, decoy buttons) living

&#x20; \*inside\* individual cells. This is what most rich Safaris are.



\---



\## 4. Building blocks reference (the full vocabulary)



Design only with these. They are exactly what the host can build.



\### The Map (optional)

\- Grid of cells `A1…`; each cell is a channel with: a \*\*title\*\*, \*\*description\*\*, optional \*\*image\*\*,

&#x20; an \*\*emoji\*\* (used in the channel name), and any number of \*\*Actions\*\*, \*\*stores\*\*, and \*\*drops\*\*.

\- \*\*Drops:\*\* a quick way to put a collectible on a cell as a button — an \*\*item drop\*\* or \*\*currency

&#x20; drop\*\*. Claim model is either \*\*once per player\*\* (everyone can grab one) or \*\*once per season\*\*

&#x20; (first player only, then it's gone).

\- \*\*Blacklist:\*\* list of cells nobody can move into (until reverse-blacklisted by an item).

\- \*\*Stamina:\*\* optional movement cost (default 1 per move, regenerates over time). Use it to pace

&#x20; exploration; turn it effectively off by setting a high max if you don't want it.



\### Items

Fields you can set: \*\*name\*\*, \*\*emoji\*\*, \*\*description\*\*, \*\*price\*\* (currency cost in a store),

\*\*max per player\*\*, \*\*consumable\*\* (Yes/No), \*\*stamina boost\*\*, \*\*reverse-blacklist cells\*\*, and

combat/economy numbers (\*\*attack\*\*, \*\*defense\*\*, good/bad round yield) for game modes that use them.

No image. Items can be \*\*default items\*\* (auto-granted when a player joins the Safari).



\### Actions = Triggers + Conditions + Outcomes

An \*\*Action\*\* is one interactive thing. It has:



\*\*A Trigger\*\* (how it fires) — choose one:

| Trigger | Player does… | Use it for |

|---|---|---|

| \*\*Button\*\* | clicks a button | the default for everything |

| \*\*Command\*\* | types a phrase | secret words, "say the password aloud" |

| \*\*Button + Secret Code\*\* | clicks, then types a code into a popup | \*\*code/combination puzzles\*\* ("enter 1790") |

| \*\*Button + Input\*\* | clicks, then types free text | open answers; the text can be used in outcomes |

| \*\*Scheduled\*\* | nothing — runs automatically at a set time | timed reveals, round ticks |



\*\*Conditions\*\* (optional gate) — the Action can branch into "\*\*if met\*\*" vs "\*\*if not met\*\*" outcomes.

You can check:

\- \*\*Item:\*\* has / doesn't have an item (with a quantity) — the workhorse.

\- \*\*Currency:\*\* ≥ value / ≤ value / equals zero.

\- \*\*Role:\*\* has / doesn't have a Discord role.

\- \*\*Attribute:\*\* a stat compared to a number, or to another stat, or several stats combined.

\- \*\*Dice:\*\* a D20 roll vs a difficulty, or a flat % chance.

Multiple conditions combine with AND / OR.



\*\*Outcomes\*\* (what it does — up to 6, each set to run "always", on "met", or on "not met"):

| Outcome | Effect |

|---|---|

| \*\*Display Text\*\* | show a message (title + text + optional colour + optional image) |

| \*\*Give / Remove Currency\*\* | add (positive) or subtract (negative) currency |

| \*\*Give / Remove Item\*\* | give or take an item (set quantity + give/remove) |

| \*\*Give Role / Remove Role\*\* | grant or strip a Discord role |

| \*\*Modify Attribute\*\* | add / subtract / set a stat (e.g. HP) |

| \*\*Follow-up Action\*\* | chain into another Action (this is how Action-Graph "rooms" link) |

| \*\*Move Player\*\* | teleport the player to any cell (secret passages, elevators) |

| \*\*Manage Player State\*\* | initialise / teleport / remove the player from the Safari |

| \*\*Fight Enemy\*\* | run a combat against a defined enemy (win/lose branches the outcome) |

| \*\*Calculate Results / Attack\*\* | resolve economy-game round earnings / attacks |



\*\*Usage limits\*\* (on give-currency / give-item / modify-attribute / fight-enemy outcomes) — how often a

player can claim the reward: \*\*unlimited\*\*, \*\*once per player\*\*, \*\*once ever (globally)\*\*,

\*\*once per time-period\*\*, or a \*\*custom\*\* rule. This is how you stop "search the barrel" giving infinite

loot — set it to \*\*once per player\*\*.



\### Crafting (combine items)

A "recipe" is just an Action flagged to appear in the \*\*Crafting menu\*\*. The quick builder makes

"Item A + Item B → Item C" in one step (checks you have the inputs, removes them, gives the output).

You can rename the whole feature per server ("Cooking", "Alchemy"…). \*\*Remember the name gotcha\*\* (§2).



\### Stores \& Currency

\- \*\*Currency:\*\* one number per player, renameable ("Coins", "Eggs"…), with an emoji. Never goes below 0.

\- \*\*Stores:\*\* a themed shop holding items at per-store prices, optional stock limits, optional

&#x20; role-restricted access. Players spend currency to buy.



\### Attributes / Stamina

\- \*\*Stamina\*\* paces map movement. You can add \*\*custom stats\*\* (e.g. HP, Energy) that items modify and

&#x20; conditions check — good for combat or survival designs. Stats regenerate over time on their own.



\### Challenge + Timer

\- A \*\*Challenge\*\* is a separate content card (great for a one-off task that doesn't need a whole map).

&#x20; A challenge action can have its \*\*Timer set to "Timed"\*\* → when the player starts it, CastBot posts a

&#x20; live stopwatch with a \*\*Stop Timer\*\* button and records their exact elapsed time. Perfect for

&#x20; "beat the clock" / speedrun framing.



\---



\## 5. The Translation Dictionary



Map common adventure tropes (what a creative brief will say) → CastBot mechanics (what you build).

\*\*This is the heart of the guide.\*\* When a design idea appears, find its row.



| The brief says… | Build it as… |

|---|---|

| "Locked door / gated room; need the Key" | \*\*Blacklist\*\* the cells behind it + put those cells on the Key item's \*\*Reverse Blacklist\*\*. (Cell must be adjacent to reach.) |

| "A new area opens up after X happens" | The X-Action gives a \*\*flag item\*\* whose Reverse Blacklist covers the new cells. |

| "Search the barrel / look under the newspaper → find an item" | A \*\*Button Action\*\* on that cell, outcome \*\*Give Item\*\*, \*\*usage limit: once per player\*\* (so it can't be farmed). |

| "Talk to the NPC → get a hint" | A \*\*Button Action\*\*, outcome \*\*Display Text\*\*. Pure flavour NPCs ("bartender refuses") are just display text, no mechanic. |

| "Talk to them \*again\* for a new/escalating hint" | First talk gives flag item "Talked 1". Second Action requires "Talked 1", shows hint 2, gives "Talked 2". Chain as needed. (Or use \*\*once-per-time-period\*\* for a cooldown.) |

| "Enter the code / password / date (e.g. 1790)" | A \*\*Button + Secret Code\*\* Action; correct code → "if met" outcomes (give item / unlock). |

| "Type the magic word" | A \*\*Command\*\* trigger with that phrase. |

| "Open-ended answer" | \*\*Button + Input\*\*; the typed text flows into the outcome. |

| "Combine A + B → C" (apron + wine = disguise) | A \*\*Crafting recipe\*\* (Quick Crafting). Name it so players know the inputs. |

| "Need two things at once to proceed" | An Action with \*\*two item conditions (AND)\*\*; "if met" → proceed. |

| "Multiple-choice puzzle; only one answer is right" | \*\*Decoy buttons:\*\* several Button Actions; only the correct one gives the progress flag, the others Display Text "Nothing happens." |

| "Secret passage / hidden staircase / elevator to a far room" | An Action with a \*\*Move Player\*\* outcome to the destination cell (bypasses adjacency). Often gated by a condition or a "found the passage" flag. |

| "An item reveals a code / picture / clue" | The item's linked Action uses \*\*Display Text with an image\*\* (the clue picture). |

| "Buy supplies from a merchant" | A \*\*Store\*\* + \*\*Currency\*\*. |

| "Earn money by doing things" | \*\*Give Currency\*\* outcomes (positive amounts). |

| "It's a race / timed challenge" | A \*\*Challenge\*\* with the \*\*Timer = Timed\*\* action; players stop their own clock at the end. |

| "You win when you reach the final room" | Final cell: a public \*\*Display Text\*\* Action ("You made it!"). If timed, tell them to hit Stop Timer. Optionally \*\*Give Role\*\* "Winner". |

| "Limited stock / first-come-first-served loot" | A \*\*currency/item drop\*\* set to \*\*once per season\*\*, or a store item with \*\*stock\*\*. |

| "Costs energy/effort to act" | \*\*Stamina\*\* (or a custom attribute) + \*\*Modify Attribute\*\* / \*\*Check Points\*\* gating. |

| "Fight a guard/monster" | Define an \*\*Enemy\*\* + a \*\*Fight Enemy\*\* outcome (win/lose branches). |



\### Things to flag (CastBot can't do these as-stated — substitute)

\- \*\*Free "use any item on any object."\*\* → Pre-place specific Button Actions, or use Crafting/conditions.

\- \*\*Per-puzzle countdown that locks you out.\*\* → Only the Challenge \*stopwatch\* exists; reframe as

&#x20; "fastest time wins", or gate by a scheduled reveal.

\- \*\*Truly arbitrary memory / variables.\*\* → Encode as flag items, currency, attributes, roles, or claims.

\- \*\*Per-player-different unlocks from the same item.\*\* → Reverse-blacklist is the same for all holders;

&#x20; use separate items or role conditions for per-player differences.

\- \*\*Item images / inventory art.\*\* → Emoji only; put art in room/Action text.

\- \*\*A map that's a non-grid web of rooms.\*\* → Either embed it on a grid (keep connected rooms adjacent)

&#x20; or switch to the \*\*Action-Graph\*\* paradigm.

\- \*\*More than 26 columns, or > 400 cells, or resizing a live map.\*\* → Redesign within limits.



\---



\## 6. The Design Method (follow in order)



1\. \*\*Capture intent.\*\* Theme \& story; the \*\*win condition\*\*; co-op or competitive; how many players;

&#x20;  single-session or persistent; timed?

2\. \*\*Choose the paradigm\*\* (§3c): Grid Map, Action Graph, or blend. State \*why\*.

3\. \*\*List the state.\*\* Write down every gate / secret / progress flag in the story. For each, assign it

&#x20;  to: an item, a \*\*flag item\*\*, currency, an attribute, a role, or a usage-claim. \*Do this before

&#x20;  laying anything out\* — it forces CastBot-native thinking.

4\. \*\*Lay out the world.\*\*

&#x20;  - \*Grid:\* draw an ASCII grid with coordinates; mark the \*\*start cell\*\*; mark \*\*blacklisted\*\* cells;

&#x20;    confirm the intended path is \*\*adjacency-connected\*\*; list each cell's channel emoji + name.

&#x20;  - \*Action Graph:\* list each "room" as a node, its Display Text, and which buttons lead where.

5\. \*\*Design items\*\* (real + flag): name, emoji, description, role (key / tool / clue / flag / consumable

&#x20;  / combat / economy), reverse-blacklist cells (if a key), how it's obtained.

6\. \*\*Design interactions.\*\* For each puzzle/NPC/search/door: specify the Action — trigger type,

&#x20;  conditions, ordered outcomes (with branch + usage limit). Use the Translation Dictionary.

7\. \*\*Crafting recipes\*\* for any combinations (name them with their inputs).

8\. \*\*Economy\*\* (currency name, stores, prices) — only if the design uses money.

9\. \*\*Pacing\*\* (stamina / custom attributes) and \*\*timing\*\* (challenge timer) — only if relevant.

10\. \*\*Validation pass.\*\* Check every element against the Golden Constraints (§2) and the "things to flag"

&#x20;   list (§5). For anything that doesn't fit, propose the closest CastBot-native substitute and say so.

11\. \*\*Emit the Build Spec\*\* (§8 template) + a build checklist in menu order.



\---



\## 7. Worked example — translating the "Hamilton" escape room



A user's ChatGPT brief: players start outside a building, the front door is locked \& guarded, and they

gain access to more rooms by finding items, talking to NPCs, combining things, and finally entering a

secret room "before the meeting ends." The brief's "map" is a \*tree of rooms\*, not a grid.



\*\*Step 2 — paradigm.\*\* This is a classic escape room: a logic/access graph. Two valid builds:

\- \*\*Action-Graph\*\* (rooms = messages, buttons reveal the next room) — least setup, total freedom.

\- \*\*Grid Map\*\* (the immersive "I'm in the Kitchen channel" feel Hamilton wants) — embed the tree on a

&#x20; grid so connected rooms are adjacent, gate with blacklist + reverse-blacklist. \*We'll show this one,

&#x20; because it's what the host (Reece) leans toward and it best demonstrates the map mechanics.\*



\*\*Step 3 — state.\*\* Front door, servants' entrance, dining room, secret passage, three upstairs doors,

final door = \*\*gated cells\*\*, each opened by a key/flag item. "Talked to Burr", "lit the fireplace",

"solved the globe" = \*\*flag items\*\*. The disguise = a \*\*crafted item\*\* that reverse-blacklists the

servants' entrance.



\*\*Step 4 — grid layout\*\* (illustrative; keep the path adjacency-connected, blacklist everything but start):

```

&#x20;       A              B                 C

1    Tavern         Alley            Burr's Office

2    (street)       OUTSIDE ★start    (street)

3                   Front Door 🔒

4    Servants 🔒    Dining Room 🔒

5    Kitchen        Pantry 🔒

6    Hidden Stair🔒

7    THE ROOM 🔒

```

★ = start (`B2`, the only non-blacklisted cell). 🔒 = blacklisted until the right item is held. Tavern,

Alley, Burr's Office sit adjacent to start so they're reachable immediately for searching/NPCs.



\*\*Step 5 / 6 — items \& interactions (selected, to show each pattern):\*\*



| Element | CastBot build |

|---|---|

| Front door needs a key | \*\*Brass Key\*\* item, Reverse Blacklist = `\[B3]`. Blacklist `B3`. |

| Find Copper Coin under newspaper | Button Action on `B1` (Alley) → \*\*Give Item: Copper Coin\*\*, \*\*once per player\*\*. |

| Burr gives a hint, then reveals the alley | Talk-to-Burr Action on `C1` → Display Text + \*\*Give flag item "Burr's Tip"\*\* (Reverse Blacklist = `\[B1]` so the alley opens). |

| Hidden compartment → Small Brass Key | Button Action on `C1` requiring you've searched (decoy/flag) → Give Item. |

| Disguise = Apron + Wine | \*\*Quick Crafting\*\* recipe "Disguise (needs Apron + Wine)"; output \*\*Disguise\*\* item, Reverse Blacklist = `\[A4]` (servants' entrance). |

| Light the fireplace (needs Matches) | Action on `A5` (Kitchen) with \*\*condition: has Matches\*\* → "if met" Display Text "The fire roars; the cook wanders off" + \*\*Give flag "Fire Lit"\*\* (Reverse Blacklist = `\[B5]` Pantry). "if not met" → "You need a light." |

| Silver Key → Dining Room | Pantry Action → Give \*\*Silver Key\*\* (Reverse Blacklist = `\[B4]`). |

| Secret passage: press hidden button → Hidden Staircase | Dining Room Action (requires the chair-clue flags) → \*\*Move Player\*\* to `A6`, or Give flag that reverse-blacklists `A6`. |

| Globe opens with "1790" | \*\*Button + Secret Code\*\* Action in Jefferson's study; code `1790` → Give \*\*Official Invitation\*\*. |

| Final door needs Invitation + Wax Seal + Signature | Final Action with \*\*3 item conditions (AND)\*\* → "if met" \*\*Move Player\*\* to `A7` (THE ROOM). |

| Win | `A7` Action: public \*\*Display Text\*\* "You're in the room where it happens!" + (if timed) "Hit Stop Timer." |

| Timed | A \*\*Challenge\*\* action with \*\*Timer = Timed\*\*; players start it at the beginning, Stop at the end. |



\*\*Step 10 — flags raised back to the user:\*\* "Talk to Burr 3× for escalating hints" → modelled as a

flag chain (Tip 1 → Tip 2 → Tip 3). "Use the wine bottle as a disguise" isn't a free item-use; it's a

\*\*crafting\*\* step, so the wine is consumed — confirm that's OK. The room tree fits a grid, but if you'd

rather not manage \~15 channels, the \*\*Action-Graph\*\* build gives the same puzzles with far less setup.



\---



\## 8. Output: the Build Spec template



Produce the design in this shape. It maps 1:1 onto what the host clicks. Omit sections the design

doesn't use, but keep the order.



```

\# <Safari Name>



\## Overview

\- Theme / story:

\- Win condition:

\- Mode: co-op | competitive ; Players: <n> ; Timed: yes/no ; Paradigm: Grid Map | Action Graph | Blend



\## Settings

\- Currency name / emoji:

\- Starting currency:

\- Starting cell (if map):

\- Stamina: on/off (max, regen) — or "off"

\- Crafting menu name/emoji (if used):



\## Map  (Grid Map only)

\- Grid size (cols×rows, ≤26 wide, ≤400 cells):

\- Map image URL:

\- ASCII grid with coordinates, start marked, blacklisted cells marked:

\- Cell list: coord | channel emoji+name | title | description | what's here (actions/stores/drops)

\- Blacklisted cells: \[ ... ]



\## Room Graph  (Action Graph only)

\- Each room: name | display text | buttons → which Action/room they lead to | gate conditions



\## Items

| Name | Emoji | Description | Role (key/tool/clue/consumable/combat) | Reverse-blacklist cells | How obtained |



\## Flag Items (invisible state)

| Name | Represents | Granted by | Checked/used by |



\## Actions

| Action name | Where (cell / global) | Trigger | Conditions | Outcomes (in order, with branch) | Usage limit |



\## Crafting Recipes

| Recipe (name encodes inputs) | Input items | Output item |



\## Stores

| Store | Items (with price \& stock) | Access role |



\## Challenge / Timer (if used)

\- Challenge name, which action is Timed, framing.



\## Build Checklist (in menu order)

1\. Settings → currency, starting cell, stamina, crafting name

2\. Create map (image + grid) \[if map]

3\. Create items (incl. flag items; set reverse-blacklist on keys)

4\. Create stores + add items \[if economy]

5\. Blacklist the gated cells

6\. Create Actions; set trigger; add outcomes; add conditions; set usage limits

7\. Place Actions on cells (or wire follow-ups for Action-Graph)

8\. Quick Crafting recipes

9\. Enemies \[if combat]

10\. Challenge + timer \[if timed]

11\. Start Safari → select players (grants start cell, currency, default items, stamina)

12\. Playtest end-to-end as a player, then iterate



\## Constraint Check

\- List anything in the original vision that CastBot can't do as-stated, and the substitute you chose.

```



\---



\## 9. Pre-flight checklist (catch the classic mistakes)



\- \[ ] Every locked area is \*\*both\*\* blacklisted \*\*and\*\* on an item's reverse-blacklist.

\- \[ ] Every unlocked cell is \*\*adjacent\*\* to a reachable cell (or reached via a \*\*Move Player\*\* outcome).

\- \[ ] Map is ≤ 26 columns and ≤ 400 cells; dimensions are final (no resize later).

\- \[ ] Every "the game remembers…" requirement is a flag item / currency / attribute / role / claim.

\- \[ ] Every "search/find" Action has a \*\*usage limit\*\* so it can't be farmed.

\- \[ ] No Action has more than 6 outcomes.

\- \[ ] Crafting recipe \*\*names state their inputs\*\* (the menu hides ingredients).

\- \[ ] No item relies on a custom image; art lives in room/Action text.

\- \[ ] Code puzzles use \*\*Button + Secret Code\*\*; word puzzles use \*\*Command\*\*; combos use \*\*Crafting\*\*.

\- \[ ] You listed, in the Constraint Check, anything from the brief that had to be substituted.



> \*\*Tip for the host:\*\* test with a second Discord account so you see exactly what players see before

> it goes live. If the adventure is timed, the built-in Challenge stopwatch (Challenges → challenge

> action → Timer = Timed) gives every player an accurate, self-served elapsed time.



