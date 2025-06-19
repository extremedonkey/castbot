#!/bin/bash

# Setup Live Discord Logging for Production
echo "🔧 Setting up Live Discord Logging in Production..."

# Check current status
echo "📊 Current live logging status:"
node toggle-live-logging.js

echo ""
echo "🔧 Setting up production configuration..."

# Enable live logging
echo "🟢 Enabling live Discord logging..."
node toggle-live-logging.js enable

# Add your user ID to exclusion list for normal operation
echo "🚫 Adding your user to exclusion list for normal production operation..."
node toggle-live-logging.js exclude 391415444084490240

echo ""
echo "📊 Final configuration:"
node toggle-live-logging.js

echo ""
echo "✅ Live Discord logging configured for production!"
echo "📍 Logs will flow to Discord channel: https://discord.com/channels/1331657596087566398/1385059476243218552"
echo ""
echo "🔧 Management commands:"
echo "  node toggle-live-logging.js                    # Check status"
echo "  node toggle-live-logging.js exclude <userID>   # Toggle user exclusion"
echo "  node toggle-live-logging.js disable            # Disable logging"