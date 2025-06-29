#!/bin/bash

# CastBot Development Restart Script
# Your new "Ctrl+C" - restarts app while preserving ngrok tunnel
# Includes git safety net (replaces start-and-push.ps1 functionality)

set -e  # Exit on any error

echo "=== CastBot Dev Restart ==="

# Configuration
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_MESSAGE="${1:-Dev checkpoint - $(date '+%H:%M:%S')}"

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
cd "$(dirname "$0")"
# Run notification in background with timeout protection
(timeout 12s node scripts/notify-restart.js 2>/dev/null || echo "ℹ️  Discord notification failed or timed out") &
NOTIFY_PID=$!

# Wait briefly for notification, then continue
sleep 1
if kill -0 $NOTIFY_PID 2>/dev/null; then
    echo "📤 Notification sent in background"
else
    echo "✅ Notification completed"
fi

# Restart the app
echo "🔄 Restarting CastBot..."
pkill -f "node app.js" 2>/dev/null || true
sleep 2

# Start in background
cd "$(dirname "$0")"
nohup node app.js > /tmp/castbot-dev.log 2>&1 &
APP_PID=$!
echo $APP_PID > /tmp/castbot-dev.pid

# Quick verification
sleep 3
if kill -0 $APP_PID 2>/dev/null; then
    echo "✅ CastBot restarted successfully (PID $APP_PID)"
else
    echo "❌ App failed to start - check logs: tail /tmp/castbot-dev.log"
fi

# Check static domain status
echo ""
export PATH="$HOME/.local/bin:$PATH"
STATIC_URL="https://adapted-deeply-stag.ngrok-free.app"

# Check if ngrok is running with our static domain
NGROK_RUNNING=$(curl -s "http://localhost:4040/api/tunnels" 2>/dev/null | grep -c "adapted-deeply-stag.ngrok-free.app" || echo "0")

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