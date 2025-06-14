#!/bin/bash

# CastBot Development Restart Script
# Your new "Ctrl+C" - restarts app while preserving ngrok tunnel
# Includes git safety net (replaces start-and-push.ps1 functionality)

set -e  # Exit on any error

echo "=== CastBot Dev Restart ==="

# Configuration
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_MESSAGE="${1:-Dev checkpoint - $(date '+%H:%M:%S')}"

# Git operations (safety net)
echo "🔄 Handling git operations..."
git add .

# Check if there are changes to commit
if ! git diff --staged --quiet; then
    echo "📝 Committing: $COMMIT_MESSAGE"
    git commit -m "$COMMIT_MESSAGE"
    
    echo "🚀 Pushing to $CURRENT_BRANCH..."
    if ! git push origin $CURRENT_BRANCH 2>/dev/null; then
        echo "Setting upstream and pushing..."
        git push --set-upstream origin $CURRENT_BRANCH
    fi
    echo "✅ Changes safely committed and pushed"
else
    echo "📝 No changes to commit"
fi

# Restart the app
echo "🔄 Restarting CastBot..."
pm2 restart castbot-dev

# Get current ngrok URL and show prominently
echo ""
export PATH="$HOME/.local/bin:$PATH"
NGROK_URL=$(curl -s "http://localhost:4040/api/tunnels" 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.app' | head -1)

if [ -n "$NGROK_URL" ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "🌐 NGROK URL READY FOR DISCORD CONSOLE:"
    echo ""
    echo "   📋 Copy this: $NGROK_URL/interactions"
    echo ""
    echo "   🔗 Paste here: https://discord.com/developers/applications/1328366050848411658/information"
    echo "   (Update 'Interactions Endpoint URL' field)"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "✅ App restarted successfully"
    echo "✅ ngrok tunnel active and stable"
else
    echo "⚠️  WARNING: ngrok not detected!"
    echo "   Run './dev-start.sh' to start ngrok tunnel"
    echo ""
    echo "✅ App restarted successfully"
    echo "❌ ngrok tunnel not found"
fi

echo ""
echo "📊 Use './dev-status.sh' to see full status"
echo "📋 Use 'pm2 logs castbot-dev' to monitor logs"
echo ""