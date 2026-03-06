#!/bin/bash

# CastBot Development Restart Script
# Your new "Ctrl+C" - restarts app while preserving ngrok tunnel
# Includes git safety net (replaces start-and-push.ps1 functionality)
# 
# Usage: ./dev-restart.sh [-tests] [commit-message] [custom-discord-message]
# Examples:
#   ./dev-restart.sh "Fix safari buttons"
#   ./dev-restart.sh "Fix safari buttons" "Safari Add Action button is now working!"
#   ./dev-restart.sh -tests "Fix safari buttons"   # Run unit tests before restart

set -e  # Exit on any error

echo "=== CastBot Dev Restart ==="

# Parse flags
RUN_TESTS=false
while [[ "$1" == -* ]]; do
    case "$1" in
        -tests) RUN_TESTS=true ;;
        *) echo "⚠️  Unknown flag: $1" ;;
    esac
    shift
done

# Configuration
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_MESSAGE="${1:-Dev checkpoint - $(date '+%H:%M:%S')}"
CUSTOM_MESSAGE="${2}" # Optional custom message for Discord notification

# Git operations (safety net) - non-blocking
echo "🔄 Handling git operations..."
git add .

# Check if there are changes to commit
if ! git diff --staged --quiet; then
    echo "📝 Committing: $COMMIT_MESSAGE"
    git commit -m "$COMMIT_MESSAGE"
    
    echo "🚀 Pushing to GitHub ($CURRENT_BRANCH)..."
    if git push origin $CURRENT_BRANCH; then
        echo "✅ Changes pushed to GitHub successfully"
    else
        echo "❌ Push failed - check authentication"
        echo "💡 Run 'git push' manually or check GitHub token"
        echo "ℹ️  Changes are committed locally, safe to continue"
    fi
else
    echo "📝 No changes to commit"
fi

# Run tests if -tests flag provided
TEST_SUMMARY=""
if [ "$RUN_TESTS" = true ]; then
    echo ""
    echo "🧪 Running unit tests..."
    echo "----------------------------------------"
    TEST_OUTPUT=$(node --test tests/*.test.js 2>&1)
    TEST_EXIT=$?
    echo "$TEST_OUTPUT"
    echo "----------------------------------------"
    if [ $TEST_EXIT -eq 0 ]; then
        # Extract pass/fail counts from TAP output
        TEST_PASS=$(echo "$TEST_OUTPUT" | grep "^# pass" | awk '{print $3}')
        TEST_FAIL=$(echo "$TEST_OUTPUT" | grep "^# fail" | awk '{print $3}')
        TEST_SUITES=$(echo "$TEST_OUTPUT" | grep "^# suites" | awk '{print $3}')
        TEST_SUMMARY="${TEST_PASS:-0} pass, ${TEST_FAIL:-0} fail (${TEST_SUITES:-0} suites)"
        echo "✅ All tests passed"
        echo ""
    else
        echo "❌ Tests FAILED — aborting restart"
        exit 1
    fi
fi

# Collect git information for Discord notification
GIT_FILES_CHANGED=$(git diff --cached --name-only | tr '\n' ',' | sed 's/,$//')
GIT_STATS=$(git diff --cached --stat | tail -1 | sed 's/^ *//')

# Send Discord notification
echo "🔔 Sending restart notification to Discord..."
# Ensure we're in the project root for notification script
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
# Run notification in background - let it complete independently
if [ -n "$CUSTOM_MESSAGE" ]; then
    echo "📝 Including custom message: $CUSTOM_MESSAGE"
    (node scripts/notify-restart.js "$CUSTOM_MESSAGE" "$COMMIT_MESSAGE" "$GIT_FILES_CHANGED" "$GIT_STATS" "$TEST_SUMMARY" 2>/dev/null || true) &
else
    (node scripts/notify-restart.js "" "$COMMIT_MESSAGE" "$GIT_FILES_CHANGED" "$GIT_STATS" "$TEST_SUMMARY" 2>/dev/null || true) &
fi
echo "📤 Notification sent in background"

# Restart the app using node directly
echo "🔄 Restarting CastBot..."

cd "$(git rev-parse --show-toplevel)"

# Kill existing process if running
if [ -f /tmp/castbot-dev.pid ]; then
    OLD_PID=$(cat /tmp/castbot-dev.pid)
    if kill -0 "$OLD_PID" 2>/dev/null; then
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
    fi
fi

# Kill any orphaned processes on port 3000 (but not if started by restart-logs)
# Use timeout to prevent hanging in WSL
PORT_PID=$(timeout 2 lsof -ti :3000 2>/dev/null || true)
if [ ! -z "$PORT_PID" ]; then
    # Check if this process is attached to a terminal (pts)
    # If it's attached to a terminal, it's likely from restart-logs.sh, so just kill it
    echo "  Killing process on port 3000 (PID: $PORT_PID)..."
    kill "$PORT_PID" 2>/dev/null || true
    sleep 1
fi

# Start fresh with node in background
# Append to log file to preserve tail -f connections
nohup node app.js >> /tmp/castbot-dev.log 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > /tmp/castbot-dev.pid

# Quick verification
sleep 3
if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "✅ App restarted successfully (PID: $NEW_PID)"
else
    echo "❌ App failed to start - check logs: tail /tmp/castbot-dev.log"
fi

# Check static domain status
echo ""
export PATH="$HOME/.local/bin:$PATH"
STATIC_URL="https://adapted-deeply-stag.ngrok-free.app"

# Check if ngrok is running with our static domain
NGROK_RUNNING=$(curl -s "http://localhost:4040/api/tunnels" 2>/dev/null | grep -c "adapted-deeply-stag.ngrok-free.app" 2>/dev/null || echo "0")

# Clean up any whitespace/newlines and ensure it's a valid integer
NGROK_RUNNING=$(echo "$NGROK_RUNNING" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
NGROK_RUNNING=${NGROK_RUNNING:-0}

if [ "$NGROK_RUNNING" -gt 0 ]; then
    echo "✅ App restarted successfully"
    echo "✅ Static ngrok tunnel active: $STATIC_URL"
    echo "🌟 Discord webhook permanently set - no updates needed!"
else
    echo "⚠️  WARNING: Static ngrok tunnel not detected!"
    echo "   Run './dev-start.sh' to start static tunnel"
    echo ""
    echo "✅ App restarted successfully"
    echo "❌ Static ngrok tunnel not found"
fi

echo ""
echo "📊 Use './dev-status.sh' to see full status"
echo "📋 Use 'tail -f /tmp/castbot-dev.log' to monitor logs"
echo ""