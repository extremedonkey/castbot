#!/bin/bash

# CastBot Development Stop Script  
# Cleanly stops all development services

echo "=== Stopping CastBot Development Environment ==="

# Stop pm2 app
echo "🛑 Stopping pm2 app..."
if pm2 list | grep -q "castbot-dev"; then
    pm2 delete castbot-dev
    echo "✅ CastBot app stopped"
else
    echo "📝 App not running"
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