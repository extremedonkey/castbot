#!/bin/bash

# CastBot Development Status Script
# Shows current status of all development services

echo "=== CastBot Development Status ==="
echo ""

# Configuration
export PATH="$HOME/.local/bin:$PATH"
NGROK_PORT=3000

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

# Check ngrok status
echo "🌐 NGROK STATUS:"
if check_ngrok_running $NGROK_PORT; then
    NGROK_URL=$(get_ngrok_url $NGROK_PORT)
    echo "   ✅ Running: $NGROK_URL"
    echo ""
    echo "   ═══════════════════════════════════════════════════════════"
    echo "   📋 DISCORD WEBHOOK URL: $NGROK_URL/interactions"
    echo "   🔗 UPDATE HERE: https://discord.com/developers/applications/1328366050848411658/information"
    echo "   ═══════════════════════════════════════════════════════════"
else
    echo "   ❌ Not running (use './dev-start.sh' to start)"
fi

echo ""

# Check app status
echo "🚀 CASTBOT APP STATUS:"
if [ -f /tmp/castbot-dev.pid ] && kill -0 $(cat /tmp/castbot-dev.pid) 2>/dev/null; then
    APP_PID=$(cat /tmp/castbot-dev.pid)
    echo "   ✅ Running (PID: $APP_PID)"
    echo "   📋 Logs: tail -f /tmp/castbot-dev.log"
    echo "   🔄 Restart: ./dev-restart.sh"
else
    echo "   ❌ Not running (use './dev-start.sh' to start)"
fi

echo ""

# Check git status
echo "📝 GIT STATUS:"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "   🌿 Branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --staged --quiet; then
    echo "   📋 Uncommitted changes detected"
    git status --porcelain | head -5
else
    echo "   ✅ Working directory clean"
fi

echo ""

# Show recent commits
echo "📚 RECENT COMMITS:"
git log --oneline -3 | sed 's/^/   /'

echo ""
echo "=== QUICK COMMANDS ==="
echo "./dev-restart.sh      - Restart app (your new Ctrl+C)"
echo "./dev-stop.sh         - Stop everything cleanly"
echo "pm2 logs castbot-dev   - Monitor real-time logs"
echo "pm2 monit             - PM2 monitoring dashboard"
echo ""