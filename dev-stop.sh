#!/bin/bash

# CastBot Development Stop Script  
# Cleanly stops all development services

echo "=== Stopping CastBot Development Environment ==="

# Stop node app
echo "🛑 Stopping CastBot app..."
if [ -f /tmp/castbot-dev.pid ] && kill -0 $(cat /tmp/castbot-dev.pid) 2>/dev/null; then
    kill $(cat /tmp/castbot-dev.pid)
    rm -f /tmp/castbot-dev.pid
    echo "✅ CastBot app stopped"
else
    pkill -f "node app.js" 2>/dev/null || true
    echo "✅ CastBot processes cleaned up"
fi

# Stop ngrok (optional - you might want to keep it running)
echo ""
echo "🌐 ngrok Status:"
if pgrep -f "ngrok" > /dev/null; then
    echo "   🔄 ngrok is running"
    echo "   💡 Tip: ngrok can stay running to preserve URL"
    echo "   🛑 To stop ngrok: pkill -f ngrok"
else
    echo "   📝 ngrok not running"
fi

echo ""
echo "✅ Development environment stopped"
echo ""
echo "📋 To restart: ./dev-start.sh"
echo "📋 To check status: ./dev-status.sh"
echo ""