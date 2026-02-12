#!/bin/bash
# Restart Alternassist server + Cloudflare tunnel

echo "Stopping existing processes..."
kill $(lsof -ti:3000) 2>/dev/null
pkill -f "cloudflared tunnel.*alternassist" 2>/dev/null
sleep 2

echo "Starting server..."
NODE_ENV=production nohup node server.js > /tmp/alternassist-server.log 2>&1 &
echo "Server PID: $!"

echo "Starting Cloudflare tunnel..."
nohup cloudflared tunnel --config /Users/micahmacmini/.cloudflared/config.yml run alternassist > /tmp/cloudflared.log 2>&1 &
echo "Tunnel PID: $!"

sleep 3

# Verify
if curl -s http://localhost:3000/ -o /dev/null -w "%{http_code}" | grep -q "302"; then
  echo "✓ Server running on port 3000"
else
  echo "✗ Server failed to start"
fi

if cloudflared tunnel info alternassist 2>&1 | grep -q "CONNECTOR"; then
  echo "✓ Tunnel connected"
else
  echo "✗ Tunnel not connected (may need a few more seconds)"
fi
