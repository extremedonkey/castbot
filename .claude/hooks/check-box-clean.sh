#!/bin/bash
# Stop hook — TEST box (castbot-blue) ONLY.
# Detects the box by the CANONICAL REPO PATH, not the session's cwd — a `claude`
# launched from /home/ubuntu (instead of the repo) would otherwise slip past, because
# `git rev-parse` finds no repo there. Refuses to finish with uncommitted TRACKED
# changes, forcing box-restart.sh. Loop-guarded + fail-open (no-op on the laptop).

REPO=/home/ubuntu/castbot
[ -d "$REPO/.git" ] || exit 0     # only the box has this path → no-op everywhere else

INPUT=$(cat)
# Loop guard: if we're already continuing because of this Stop hook, allow the stop.
if echo "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Block only on modified/staged TRACKED files — untracked temp junk doesn't count.
if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "🛑 Uncommitted changes in /home/ubuntu/castbot (TEST box). Finish with:" >&2
  echo "   cd ~/castbot && ./scripts/dev/box-restart.sh \"describe the change\"" >&2
  echo "   (commits → syncs main → tests → restarts the test bot. Never leave the box dirty.)" >&2
  exit 2
fi
exit 0
