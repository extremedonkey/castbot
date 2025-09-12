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

# Restart the app using PM2
echo "🔄 Restarting CastBot..."
cd "$(git rev-parse --show-toplevel)"
pm2 restart castbot-dev-pm 2>/dev/null || pm2 start app.js --name castbot-dev-pm

# Quick verification
sleep 2
if pm2 status | grep -q "castbot-dev-pm.*online"; then
    echo "✅ App restarted successfully"
else
    echo "❌ App failed to start - check logs below"
fi

echo ""
echo "📋 Starting log tail..."
echo "----------------------------------------"
echo ""

# Start tailing PM2 logs
pm2 logs castbot-dev-pm
