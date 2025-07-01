#!/bin/bash
# CastBot Development Script Aliases Setup
# Run this script to add development aliases to your shell configuration

CASTBOT_DIR="/home/reece/castbot"
SCRIPT_DIR="$CASTBOT_DIR/scripts/dev"

# Detect shell configuration file
if [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    echo "Unsupported shell. Please add aliases manually."
    exit 1
fi

echo "Setting up CastBot development aliases..."
echo "Shell config file: $SHELL_CONFIG"

# Check if aliases already exist
if grep -q "# CastBot Development Aliases" "$SHELL_CONFIG" 2>/dev/null; then
    echo "CastBot aliases already exist in $SHELL_CONFIG"
    echo "Remove the existing section if you want to reinstall."
    exit 0
fi

# Add aliases to shell configuration
cat >> "$SHELL_CONFIG" << 'EOF'

# CastBot Development Aliases
alias dev-start="$HOME/castbot/scripts/dev/dev-start.sh"
alias dev-restart="$HOME/castbot/scripts/dev/dev-restart.sh"
alias dev-status="$HOME/castbot/scripts/dev/dev-status.sh"
alias dev-stop="$HOME/castbot/scripts/dev/dev-stop.sh"
alias dev-restart-logs="$HOME/castbot/scripts/dev/dev-restart-logs.sh"

# Alternative: Add scripts directory to PATH
# export PATH="$HOME/castbot/scripts/dev:$PATH"
EOF

echo "✅ Aliases added to $SHELL_CONFIG"
echo ""
echo "To use the aliases, either:"
echo "1. Restart your terminal"
echo "2. Run: source $SHELL_CONFIG"
echo ""
echo "Then you can use:"
echo "  dev-start      # Start development environment"
echo "  dev-restart    # Restart after changes"
echo "  dev-status     # Check status"
echo "  dev-stop       # Stop development environment"
echo "  dev-restart-logs # Restart with log monitoring"
echo ""
echo "You can run these commands from any directory!"