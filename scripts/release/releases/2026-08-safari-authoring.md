🪙 Currency Drops in One Step, 🔄 Reset Safari & 👥 Player Claims
-# Sunday 2nd August 2026
Credit to : @___

Building a Safari just got noticeably less clicky — and there's finally a way to clean up after a test run without dismantling everything you built. 🎉

## 🪙 Currency Drops in One Step
Adding a **Give / Remove Currency** outcome used to take five clicks across four screens. It's now a **single popup** — amount, usage limit, and when it runs — then straight back to the Action editor.

Usage: `/menu` → ⚡ Actions → open an Action → **Add Outcome** → 🪙 Give / Remove Currency

Usage limit now defaults to **👤 Once Per Player** (the one almost everyone wants). Need the advanced options like ⚙️ Custom limits or Usage Templates? They're still there — open the outcome and hit **Edit**.

## 🔄 Reset Safari
Finished a pre-launch test and want a clean slate? You can now clear Safari **play state** in one go — claimed idols, opened chests, tester inventories, currency, and round state.

Usage: `/menu` → 🦁 Safari → 🗺️ Map Explorer → 🔄 **Reset Safari**

Three scopes, from a light **Testing Reset** up to a full wipe that also removes players from the map. Every one of them shows you a **preview of exactly what's about to be cleared** first — including which players are holding your one-time-only rewards.

**It never deletes your Actions, Items, Stores or Maps.** Your build is safe; only the playing of it gets reset.

## 👥 Player Claims Everywhere
The 👥 **Player Claims** screen now shows up on **every** claimable outcome, in **every** section — Opening, Pass and Fail alike.

Previously it quietly disappeared whenever an outcome didn't have a usage limit set, which made it look like Fail outcomes simply didn't have the feature. They always did.

## 🪙 Honest Currency Messages
A **-50** outcome aimed at a player holding only **10** took 10 — but told them it took 50. Players now see what actually happened.

And an outcome that takes currency away finally reads **Remove Currency** instead of **Give Currency** everywhere in the editor, matching how 🎁 Give / Remove Item has always worked.

## 📌 CastDock Button Visibility
Ticked a button and it never appeared on the dock? An explicit tick now **wins** over the tidiness rules that were silently hiding it.

And when a button genuinely can't appear yet — because that feature isn't set up on your server — the setup screen now **tells you which button and why**, instead of leaving you to guess.

## 📜 Sheets Import Guidance
The Google Sheets importer now warns you up front that a season needs a **category** before Apply will work — checked against your actual season, flagged on the screen, and written into the generated script. No more finding out halfway through.

Example

  You've spent a week testing your Safari. Idols claimed, chests opened,
  testers carrying loot.
  # 🔄 Reset Safari → 👀 Preview → ✅ Confirm → 🎬 clean slate, build intact
