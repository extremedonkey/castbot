#!/bin/bash
# SessionStart hook — TEST box (castbot-blue) ONLY.
# Pulls latest main so box-Claude never starts from stale code (RaP 0913, two-tree rule).
# Only pulls when the tree is clean, so it can't disrupt in-progress work. Fail-open:
# no-op on the dev laptop; never errors out a session start.

TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
case "$TOPLEVEL" in
  /home/ubuntu/*) ;;        # on the test box → sync
  *) exit 0 ;;              # laptop / anywhere else → no-op
esac

cd "$TOPLEVEL" || exit 0

if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "[box] uncommitted changes present — skipped auto-pull. Finish via ./scripts/dev/box-restart.sh."
  exit 0
fi

echo "[box] syncing with origin/main..."
git pull --rebase origin main 2>&1 | tail -2 || true
exit 0
