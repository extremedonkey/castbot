#  :arrows_counterclockwise: Reset Safari  &  :coin: One-Step Currency Drops
 -#  Sunday 2nd August 2026
  Credit to : @___

  Building a Safari just got noticeably less clicky — and there's finally a way to **clean up after a
  test run** without dismantling everything you built. :tada:

  ## :coin: Currency Drops in One Step
  Adding a :coin: Give / Remove Currency outcome used to take **five clicks across four screens**. It's
  now a **single popup** — amount, usage limit, and when it runs — then straight back to the Action editor.
> Usage: `/menu` → :zap: Actions → open an Action → **Add Outcome** → :coin: Give / Remove Currency

  Usage limit now defaults to **:bust_in_silhouette: Once Per Player** — the one almost everyone wants.
  The advanced options (:gear: Custom limits, Usage Templates) are still there: open the outcome and tap
  **:pencil: Edit**.

  ## :arrows_counterclockwise: Reset Safari
  Finished a pre-launch test and want a clean slate? You can now clear Safari **play state** in one go —
  claimed idols, opened chests, tester inventories, currency and round state.
> Usage: `/menu` → :lion_face: Safari → :map: Map Explorer → **:arrows_counterclockwise: Reset Safari**

  Three scopes, from a light **Testing Reset** up to a full wipe that also removes players from the map.
  Every one of them shows you a **preview of exactly what's about to be cleared** first — including which
  players are currently holding your one-time-only rewards.

  **It never deletes your Actions, Items, Stores or Maps.** Your build is safe; only the *playing* of it
  gets reset.

  ## :busts_in_silhouette: Player Claims Everywhere
  The **:busts_in_silhouette: Player Claims** screen now appears on **every** claimable Outcome, in
  **every** section — :blue_circle: Opening, :green_circle: Pass and :red_circle: Fail alike.

  It used to quietly disappear whenever an Outcome had no Usage Limit set, which made it look like Fail
  Outcomes simply didn't have the feature. They always did.

  ## :coin: Honest Currency Messages
  A **-50** Outcome aimed at a player holding only **10** took 10 — but told them it took 50. Players now
  see **what actually happened**.

  And an Outcome that takes currency away finally reads **Remove Currency** instead of Give Currency
  across the editor, matching how :gift: Give / Remove Item has always worked.

  ## :pushpin: CastDock Button Visibility
  Ticked a button and it never showed up on the dock? An explicit tick now **wins** over the tidiness
  rules that were silently hiding it.

  And when a button genuinely *can't* appear yet — because that feature isn't set up on your server — the
  setup screen now **tells you which button, and why**, instead of leaving you to guess.

  ## :scroll: Sheets Import Guidance
  The Google Sheets importer now warns you up front that a season needs a **category** before Apply will
  work — checked against your real season, flagged on screen, and written into the generated script. No
  more finding out halfway through.

  ```Example```
  A week of testing behind you. Idols claimed, chests opened, testers carrying loot.
  # :arrows_counterclockwise: Reset Safari → :eyes: Preview → :white_check_mark: Confirm → :clapper: clean slate, build intact
