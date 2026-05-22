#!/usr/bin/env bash
# deploy.sh — Build client locally, rsync server + client to DigitalOcean, restart PM2
#
# Usage:
#   ./deploy/deploy.sh [user@host]
#
# Examples:
#   ./deploy/deploy.sh root@123.45.67.89
#   ./deploy/deploy.sh deploy@reminder.yourdomain.com
#
# Requirements (local):  rsync, ssh, node/npm (for client build)
# Requirements (remote): bun, pm2, nginx already set up (run setup-server.sh once)

set -euo pipefail

REMOTE="${1:-}"
REMOTE_DIR="/var/www/reminder"

if [[ -z "$REMOTE" ]]; then
  echo "Usage: $0 user@host"
  echo "Example: $0 root@123.45.67.89"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> [1/4] Building client..."
cd "$PROJECT_ROOT/client"
npm install --silent
npm run build
echo "    Client built → client/dist/"

echo "==> [2/4] Syncing server to $REMOTE:$REMOTE_DIR/server/ ..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.db' \
  --exclude='data/' \
  "$PROJECT_ROOT/server/" \
  "$REMOTE:$REMOTE_DIR/server/"

echo "==> [3/4] Syncing client/dist to $REMOTE:$REMOTE_DIR/client/dist/ ..."
rsync -az --delete \
  "$PROJECT_ROOT/client/dist/" \
  "$REMOTE:$REMOTE_DIR/client/dist/"

echo "==> [4/4] Installing server deps and restarting PM2 on remote..."
ssh "$REMOTE" bash << EOF
  set -e
  cd $REMOTE_DIR/server
  bun install --frozen-lockfile 2>/dev/null || bun install
  pm2 reload $REMOTE_DIR/deploy/reminder.ecosystem.config.cjs --update-env \
    || pm2 start $REMOTE_DIR/deploy/reminder.ecosystem.config.cjs
  pm2 save
EOF

echo ""
echo "==> Deploy complete!"
echo "    App running at http://$REMOTE"
