#!/bin/bash
set -e

echo "⏪ Rolling back Alternassist..."
echo ""

cd ~/Developer/alternassist

# Show current commit
CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo "Current commit: $CURRENT_COMMIT"

# Checkout previous commit
echo "📥 Checking out previous commit..."
git checkout HEAD~1

# Show new commit
NEW_COMMIT=$(git rev-parse --short HEAD)
echo "Rolled back to commit: $NEW_COMMIT"

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

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
echo "✨ Rollback complete!"
echo ""
echo "⚠️  Note: You are now in a detached HEAD state."
echo "To return to the main branch: git checkout main"
