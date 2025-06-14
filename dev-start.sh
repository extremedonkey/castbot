#!/bin/bash

# CastBot WSL Development Startup Script
# Handles ngrok tunnel management, git operations, and pm2 app startup

set -e  # Exit on any error

echo "=== CastBot WSL Dev Startup ==="

# Configuration
export PATH="$HOME/.local/bin:$PATH"
NGROK_PORT=3000
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT_MESSAGE="${1:-Auto-commit}"

# Function to check if ngrok is running
check_ngrok_running() {
    local port=$1
    if curl -s "http://localhost:4040/api/tunnels" 2>/dev/null | grep -q "http://localhost:$port"; then
        return 0
    else
        return 1
    fi
}

# Function to get ngrok URL
get_ngrok_url() {
    local port=$1
    local url=$(curl -s "http://localhost:4040/api/tunnels" 2>/dev/null | grep -o 'https://[^"]*\.ngrok-free\.app' | head -1)
    echo "$url"
}

# Function to start ngrok in background with static domain
start_ngrok() {
    local port=$1
    echo "Starting ngrok tunnel on port $port with static domain..."
    
    # Start ngrok with static domain in background
    nohup ngrok http --url=adapted-deeply-stag.ngrok-free.app $port > /dev/null 2>&1 &
    local ngrok_pid=$!
    
    # Wait for ngrok to initialize
    local attempts=0
    local max_attempts=30
    
    while [ $attempts -lt $max_attempts ]; do
        if check_ngrok_running $port; then
            echo "✅ ngrok tunnel established"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
        if [ $((attempts % 5)) -eq 0 ]; then
            echo "Waiting for ngrok... ($attempts/$max_attempts)"
        fi
    done
    
    echo "❌ Failed to start ngrok after $max_attempts seconds"
    return 1
}

# Check if ngrok is already running
echo "Checking ngrok status..."
if check_ngrok_running $NGROK_PORT; then
    echo "✅ ngrok already running"
    NGROK_URL=$(get_ngrok_url $NGROK_PORT)
else
    echo "Starting ngrok..."
    if start_ngrok $NGROK_PORT; then
        sleep 2  # Give it a moment to be ready
        NGROK_URL=$(get_ngrok_url $NGROK_PORT)
    else
        echo "❌ Failed to start ngrok"
        exit 1
    fi
fi

# Git operations (replicate start-and-push.ps1 safety net)
echo "Handling git operations..."
git add .

# Check if there are changes to commit
if ! git diff --staged --quiet; then
    echo "Committing changes: $COMMIT_MESSAGE"
    git commit -m "$COMMIT_MESSAGE"
    
    echo "Pushing to $CURRENT_BRANCH..."
    if ! git push origin $CURRENT_BRANCH 2>/dev/null; then
        echo "Setting upstream and pushing..."
        git push --set-upstream origin $CURRENT_BRANCH
    fi
    echo "✅ Changes pushed to $CURRENT_BRANCH"
else
    echo "No changes to commit"
fi

# Start the app with node in background (pm2 has WSL networking issues)
echo "Starting CastBot with node..."
pkill -f "node app.js" 2>/dev/null || true  # Kill any existing instances
nohup node app.js > /tmp/castbot-dev.log 2>&1 &
APP_PID=$!
echo $APP_PID > /tmp/castbot-dev.pid
echo "✅ CastBot started with PID $APP_PID"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "🎉 DEVELOPMENT ENVIRONMENT READY!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "✅ Static ngrok tunnel: https://adapted-deeply-stag.ngrok-free.app"
echo "✅ CastBot running with pm2 (castbot-dev)"
echo ""
echo "🌟 STATIC DOMAIN SETUP:"
echo "   Your Discord webhook is permanently set to:"
echo "   https://adapted-deeply-stag.ngrok-free.app/interactions"
echo ""
echo "   ✨ No more manual Discord console updates needed!"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📋 DEVELOPMENT COMMANDS:"
echo "   ./dev-restart.sh       - Restart app (your new Ctrl+C)"
echo "   ./dev-status.sh        - Check status + show URLs"
echo "   tail -f /tmp/castbot-dev.log - Monitor real-time logs"
echo "   ./dev-stop.sh          - Stop everything"
echo ""