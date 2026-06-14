#!/bin/bash
# SessionStart hook — TEST box (castbot-blue) ONLY.
# Detects the box by the CANONICAL REPO PATH (cwd-independent — works even if `claude`
# was launched from /home/ubuntu instead of the repo). Pulls latest main so box-Claude
# never starts from stale code. Only pulls when clean; fail-open (no-op on the laptop).

REPO=/home/ubuntu/castbot
[ -d "$REPO/.git" ] || exit 0

if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "[box] uncommitted changes present — skipped auto-pull. Finish via 'cd ~/castbot && ./scripts/dev/box-restart.sh'."
  exit 0
fi
echo "[box] syncing /home/ubuntu/castbot with origin/main..."
git -C "$REPO" pull --rebase origin main 2>&1 | tail -2 || true
exit 0
