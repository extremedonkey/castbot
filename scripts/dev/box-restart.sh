#!/bin/bash

# CastBot TEST-box Restart Script — the box-side twin of dev-restart.sh.
#
# Run this ON castbot-blue (the always-on test box) whenever Claude Code edits
# files directly on the box. It keeps the two working trees (dev laptop +
# test box) in sync through GitHub `main`, which is the ONLY sync layer.
#
# It: commits your local work → pull --rebase (integrate laptop changes) →
#     push to main (backup) → runs the unit-test gate → pm2 restart castbot-pm.
#
# Usage (on the box):
#   ./scripts/dev/box-restart.sh "descriptive commit message"
#
# 🔴 Do NOT run this on the dev laptop — use ./scripts/dev/dev-restart.sh there.
# 🔴 Never finish a task on the box with uncommitted changes: always end via this
#    script so the laptop's next `dev-restart.sh` pull is clean.

set -e

# Guard: this script is for the test box only (castbot-blue).
if [ "$INSTANCE_ROLE" != "test" ] && [ ! -d /home/ubuntu/castbot ]; then
    echo "❌ box-restart.sh is for the TEST box (castbot-blue) only."
    echo "   On the dev laptop use: ./scripts/dev/dev-restart.sh"
    exit 1
fi

# Guard: never pm2-restart the box while a Deploy Prod run is in flight — the deploy
# child (spawned by src/monitoring/prodDeploy.js, which owns this lockfile) would be
# killed mid-pull, leaving prod half-deployed with nobody watching. A lock older than
# 10 minutes is a crash leftover and is ignored.
DEPLOY_LOCK="/tmp/castbot-prod-deploy.lock"
if [ -f "$DEPLOY_LOCK" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$DEPLOY_LOCK" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -lt 600 ]; then
        echo "⛔ A Deploy Prod run is in flight (lock: $DEPLOY_LOCK, ${LOCK_AGE}s old)."
        echo "   Restarting the box now would kill the deploy mid-pull. Wait for the"
        echo "   result card in Discord, then re-run. (Stale >10min locks are ignored.)"
        exit 1
    fi
    echo "⚠️  Ignoring stale deploy lock (${LOCK_AGE}s old) — crash leftover."
fi

# Resolve the repo root from THIS script's location, so it works from any cwd
# (e.g. invoked as ~/castbot/scripts/dev/box-restart.sh from /home/ubuntu).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.." || { echo "❌ cannot locate repo root from $SCRIPT_DIR"; exit 1; }
COMMIT_MESSAGE="${1:-Box checkpoint - $(date '+%H:%M:%S')}"

echo "=== CastBot TEST-box Restart ==="

# 1. Commit local work first (so pull --rebase has a clean tree)
echo "🔄 Staging + committing local changes..."
git add .
if ! git diff --staged --quiet; then
    git commit -m "$COMMIT_MESSAGE"
    echo "📝 Committed: $COMMIT_MESSAGE"
else
    echo "📝 No local changes to commit"
fi

# 2. Integrate any laptop changes, then push (backup before the test gate)
echo "🔄 Rebasing on origin/main..."
git pull --rebase origin main
echo "🚀 Pushing to GitHub (main)..."
if git push origin main; then
    echo "✅ Pushed to GitHub"
else
    echo "⚠️  Push failed — commit is local + safe. Retry 'git push' once resolved."
fi

# 3. Unit-test gate
echo ""
echo "🧪 Running unit tests..."
if node --test tests/*.test.js > /tmp/box-test.log 2>&1; then
    echo "✅ Tests passed"
else
    echo "❌ Tests FAILED — bot NOT restarted. See /tmp/box-test.log"
    echo "   (Your work is committed + pushed; fix tests then re-run this script.)"
    exit 1
fi

# 4. Restart the test bot
echo ""
echo "🔄 Restarting test bot (pm2 castbot-pm)..."
mkdir -p logs && printf '{"type":"deploy","at":%s}' "$(date +%s%3N)" > logs/restart-reason.json
pm2 restart castbot-pm >/dev/null
echo "✅ TEST bot restarted (castbot-blue)"
echo ""
echo "📋 Logs: pm2 logs castbot-pm --lines 50"
