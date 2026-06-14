#!/bin/bash
# Stop hook — TEST box (castbot-blue) ONLY.
# Refuses to finish a task with uncommitted changes to TRACKED files, forcing the
# task to end via ./scripts/dev/box-restart.sh so the laptop's next `git pull` stays
# clean (the two-working-tree rule from RaP 0913). Fail-open everywhere else:
#   - no-op on the dev laptop (repo lives under /home/reece, not /home/ubuntu)
#   - untracked temp junk does NOT count (won't false-block)
#   - loop-guarded so it can never trap a session

TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
case "$TOPLEVEL" in
  /home/ubuntu/*) ;;        # on the test box → enforce
  *) exit 0 ;;              # laptop / anywhere else → allow
esac

INPUT=$(cat)

# Loop guard: if we're already continuing because of this Stop hook, allow the stop.
if echo "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Block only on modified/staged TRACKED files — untracked temp files don't count.
if [ -n "$(git -C "$TOPLEVEL" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "🛑 Uncommitted changes on the TEST box. End this task with:" >&2
  echo "   ./scripts/dev/box-restart.sh \"describe the change\"" >&2
  echo "   (commits → syncs main → tests → restarts the test bot. Two-tree rule: never leave the box dirty.)" >&2
  exit 2
fi

exit 0
