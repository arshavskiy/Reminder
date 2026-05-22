#!/usr/bin/env bash
# setup-server.sh — One-time bootstrap for the DigitalOcean droplet
#
# Run this once on a fresh Ubuntu 22.04+ droplet:
#   ssh root@YOUR_IP "bash -s" < deploy/setup-server.sh
#
# What it does:
#   1. Installs nginx + pm2
#   2. Creates /var/www/reminder directory structure
#   3. Creates log directory
#   4. Installs nginx config and enables the site
#   5. Starts nginx

set -euo pipefail

REMOTE_DIR="/var/www/reminder"

echo "==> Installing nginx..."
apt-get update -qq
apt-get install -y nginx

echo "==> Installing PM2 globally (via npm/bun)..."
# PM2 works with bun processes but is installed via npm
if ! command -v npm &>/dev/null; then
  # Install node/npm just for PM2 if not present
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> Creating directory structure..."
mkdir -p "$REMOTE_DIR/server"
mkdir -p "$REMOTE_DIR/client/dist"
mkdir -p "$REMOTE_DIR/deploy"
mkdir -p "$REMOTE_DIR/data/documents"
mkdir -p /var/log/reminder

echo "==> Configuring nginx..."
cp "$REMOTE_DIR/deploy/nginx.conf" /etc/nginx/sites-available/reminder
ln -sf /etc/nginx/sites-available/reminder /etc/nginx/sites-enabled/reminder
rm -f /etc/nginx/sites-enabled/default    # remove default placeholder
nginx -t
systemctl reload nginx

echo "==> Enabling PM2 on startup..."
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

echo ""
echo "==> Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy your .env to $REMOTE_DIR/server/.env"
echo "  2. Run ./deploy/deploy.sh root@YOUR_IP to deploy the app"
