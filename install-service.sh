#!/bin/bash

echo "============================================"
echo "Alternassist Background Service Installer"
echo "============================================"
echo ""

# Get the correct node path
NODE_PATH=$(which node)
echo "✓ Node.js found at: $NODE_PATH"

# Update the plist with correct node path
sed -i '' "s|/usr/local/bin/node|$NODE_PATH|g" com.alternatone.alternassist.plist

# Copy plist to LaunchAgents
echo "Installing service..."
cp com.alternatone.alternassist.plist ~/Library/LaunchAgents/

# Load the service
echo "Loading service..."
launchctl unload ~/Library/LaunchAgents/com.alternatone.alternassist.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.alternatone.alternassist.plist

echo ""
echo "✓ Service installed and started!"
echo ""
echo "Service will now:"
echo "  • Run on system startup"
echo "  • Restart automatically if it crashes"
echo "  • Run in background (no Electron window)"
echo ""
echo "Useful commands:"
echo "  • View logs: tail -f ~/Library/Logs/alternassist-server.log"
echo "  • Stop service: launchctl unload ~/Library/LaunchAgents/com.alternatone.alternassist.plist"
echo "  • Start service: launchctl load ~/Library/LaunchAgents/com.alternatone.alternassist.plist"
echo "  • Check status: launchctl list | grep alternassist"
echo ""
echo "Server URL: https://alternassist.alternatone.com"
echo "============================================"
