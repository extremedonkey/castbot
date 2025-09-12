#!/bin/bash

# CastBot Development Restart + Logs Script
# Combines dev-restart.sh functionality with immediate log tailing
# Perfect for rapid development cycles with instant feedback

set -e  # Exit on any error

echo "=== CastBot Dev Restart + Logs ==="

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

# Restart the app with PM2
echo "🔄 Restarting CastBot with PM2..."
cd "$(git rev-parse --show-toplevel)"

# Restart with PM2
pm2 restart castbot-dev-pm 2>&1

# Quick verification
sleep 3
if pm2 list | grep -q "castbot-dev-pm.*online"; then
    echo "✅ CastBot restarted successfully with PM2"
else
    echo "❌ App failed to start - check logs below"
    echo ""
    echo "📋 Starting PM2 log tail anyway..."
    pm2 logs castbot-dev-pm
    exit 1
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
echo "📋 Starting PM2 live log monitoring..."
echo "💡 Press Ctrl+C to stop log monitoring"
echo "============================================"
echo ""

# Start PM2 log streaming in foreground
pm2 logs castbot-dev-pm