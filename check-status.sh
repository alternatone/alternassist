#!/bin/bash

echo "================================================"
echo "Alternassist Service Status"
echo "================================================"
echo ""

# Check server service
echo "🖥️  Server Service:"
if launchctl list | grep -q "com.alternatone.alternassist"; then
    STATUS=$(launchctl list | grep alternassist)
    PID=$(echo $STATUS | awk '{print $1}')
    EXIT_CODE=$(echo $STATUS | awk '{print $2}')

    if [ "$EXIT_CODE" = "0" ]; then
        echo "   ✅ Running (PID: $PID)"
    else
        echo "   ❌ Error (Exit code: $EXIT_CODE)"
    fi
else
    echo "   ❌ Not running"
fi

# Check if port 3000 is open
echo ""
echo "🌐 Port 3000:"
if lsof -i :3000 > /dev/null 2>&1; then
    echo "   ✅ Server listening on port 3000"
else
    echo "   ❌ Nothing listening on port 3000"
fi

# Check tunnel
echo ""
echo "🔒 Cloudflare Tunnel:"
if ps aux | grep "cloudflared.*tunnel.*alternassist" | grep -v grep > /dev/null; then
    TUNNEL_PID=$(ps aux | grep "cloudflared.*tunnel.*alternassist" | grep -v grep | awk '{print $2}')
    echo "   ✅ Connected (PID: $TUNNEL_PID)"
else
    echo "   ❌ Not running"
fi

echo ""
echo "📋 Public URL: https://alternassist.alternatone.com"
echo ""
echo "================================================"
echo ""
echo "Logs:"
echo "  Server:  tail -f ~/Library/Logs/alternassist-server.log"
echo "  Tunnel:  tail -f ~/Library/Logs/com.cloudflare.cloudflared.out.log"
echo "================================================"
