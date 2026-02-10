#!/bin/bash
set -e

echo "🚀 Deploying Alternassist..."
echo ""

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
cd ~/Developer/alternassist
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Run migrations (if they exist)
echo "🗄️  Running database migrations..."
if [ -f "server/run-migrations.js" ]; then
    node server/run-migrations.js 2>/dev/null || echo "No migrations to run"
fi

# Restart server
echo "🔄 Restarting server..."
pm2 restart alternassist

# Wait for server to start
sleep 3

# Verify server health
echo "✅ Verifying server health..."
HEALTH_CHECK=$(curl -s http://localhost:3000/api/projects | head -c 20)
if [ ! -z "$HEALTH_CHECK" ]; then
    echo "✅ Server is running and responding"
else
    echo "⚠️  Warning: Server may not be responding correctly"
fi

echo ""
echo "✨ Deploy complete!"
echo "🌐 Server: https://alternassist.alternatone.com"
