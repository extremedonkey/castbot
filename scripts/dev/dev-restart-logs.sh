#!/bin/bash

# CastBot Development Restart Script with Live Logs
# Combines restart and log tailing in one command
# 
# Usage: ./dev-restart-logs.sh [commit-message] [custom-discord-message]

echo "=== CastBot Dev Restart + Logs ==="

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
else
    echo "📝 No changes to commit"
fi

echo "🔄 Restarting CastBot..."
cd "$(git rev-parse --show-toplevel)"

# Clean up any existing processes
echo "🧹 Cleaning up existing processes..."

# Kill any PM2 processes (if they exist)
pm2 delete castbot-dev-pm 2>/dev/null || true
pm2 delete castbot-dev 2>/dev/null || true

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
PORT_PID=$(lsof -ti :3000 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    echo "  Killing process on port 3000 (PID: $PORT_PID)..."
    kill "$PORT_PID" 2>/dev/null || true
    sleep 1
fi

# Clear old log file for fresh start
> "$LOG_FILE"

# Start the app with node (matching dev-start.sh approach)
echo "🚀 Starting CastBot with node..."
nohup node app.js > "$LOG_FILE" 2>&1 &
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
