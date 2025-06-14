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

# Show status
echo ""
echo "✅ App restarted successfully"
echo "✅ ngrok tunnel unchanged (stable URL)"
echo ""
echo "📊 Use './dev-status.sh' to see full status"
echo "📋 Use 'pm2 logs castbot-dev' to monitor logs"
echo ""