#!/bin/bash

# CastBot Development Restart Script with Live Logs
# Combines restart and log tailing in one command
#
# Usage:
#   ./dev-restart-logs.sh [commit-message] [custom-discord-message]
#   ./dev-restart-logs.sh -f [commit-message]  # Full verbose logs
#
# Flags:
#   -f    Full verbose logging (DEBUG_VERBOSE=true) - shows all debug dumps
#         Without -f: STANDARD logging (feature logs only, good for Claude Code)

echo "=== CastBot Dev Restart + Logs ==="

# Check for verbose flag
VERBOSE_MODE=false
if [[ "$1" == "-f" ]]; then
    VERBOSE_MODE=true
    shift  # Remove -f from arguments
    echo "🔬 VERBOSE MODE: Full debug logging enabled"
fi

# Configuration
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_MESSAGE="${1:-Dev checkpoint - $(date '+%H:%M:%S')}"
CUSTOM_MESSAGE="${2}" # Optional custom message for Discord notification
LOG_FILE="/tmp/castbot-dev.log"
PID_FILE="/tmp/castbot-dev.pid"

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

# Send Discord notification
echo "🔔 Sending restart notification to Discord..."
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"
# Run notification in background
if [ -n "$CUSTOM_MESSAGE" ]; then
    (node scripts/notify-restart.js "$CUSTOM_MESSAGE" "$COMMIT_MESSAGE" 2>/dev/null || echo "ℹ️  Discord notification failed") &
else
    (node scripts/notify-restart.js "" "$COMMIT_MESSAGE" 2>/dev/null || echo "ℹ️  Discord notification failed") &
fi
echo "🔔 Notification script completed"

echo "🔄 Restarting CastBot..."
cd "$PROJECT_ROOT"

# Clean up any existing processes
echo "🧹 Cleaning up existing processes..."

# Kill existing node process if PID file exists
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "  Stopping existing process (PID: $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null || true
        sleep 1
    fi
fi

# Kill any orphaned processes on port 3000
# Use timeout to prevent hanging in WSL
PORT_PID=$(timeout 2 lsof -ti :3000 2>/dev/null || true)
if [ ! -z "$PORT_PID" ]; then
    echo "  Killing process on port 3000 (PID: $PORT_PID)..."
    kill "$PORT_PID" 2>/dev/null || true
    sleep 1
fi

# Clear old log file for fresh start
> "$LOG_FILE"

# Start the app with node (matching dev-start.sh approach)
echo "🚀 Starting CastBot with node..."
if [ "$VERBOSE_MODE" = true ]; then
    echo "   📊 Logging level: VERBOSE (full debug dumps)"
    DEBUG_VERBOSE=true nohup node app.js > "$LOG_FILE" 2>&1 &
else
    echo "   📊 Logging level: STANDARD (feature logs for Claude Code)"
    nohup node app.js > "$LOG_FILE" 2>&1 &
fi
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

# Wait for startup
sleep 2

# Verify it's running
if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "✅ App restarted successfully (PID: $NEW_PID)"
else
    echo "❌ App failed to start - check logs below"
fi

echo ""
echo "📋 Starting log tail..."
echo "----------------------------------------"
echo ""

# Start tailing the log file
tail -f "$LOG_FILE"
