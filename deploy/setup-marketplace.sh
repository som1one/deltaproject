#!/usr/bin/env bash
# One-time setup for marketplace subdomain on VPS.
# Run as root on the server after the first deploy that includes marketplace/.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/deltaproject}"
DOMAIN="marketplace.looneymoon.com"

echo "=== Marketplace Setup ==="

# 1. Create .env.local for marketplace
echo "[setup] Creating marketplace/.env.local"
cat > "$REPO_DIR/marketplace/.env.local" << 'EOF'
NEXT_PUBLIC_API_BASE_URL=http://37.220.80.62:8000
NEXT_PUBLIC_APP_URL=http://marketplace.looneymoon.com
NEXT_PUBLIC_MAIN_APP_URL=http://37.220.80.62
EOF

# 2. Install npm deps and build
echo "[setup] Installing marketplace deps & building"
cd "$REPO_DIR/marketplace"
npm ci
npm run build

# 3. Install systemd unit
echo "[setup] Installing systemd service"
cp "$REPO_DIR/deploy/deltaproject-marketplace.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable deltaproject-marketplace.service
systemctl start deltaproject-marketplace.service

# 4. Install nginx config
echo "[setup] Configuring nginx"
cp "$REPO_DIR/deploy/nginx-marketplace.conf" /etc/nginx/sites-available/marketplace
ln -sf /etc/nginx/sites-available/marketplace /etc/nginx/sites-enabled/marketplace
nginx -t && systemctl reload nginx

# 5. (Optional) SSL with certbot — uncomment if domain DNS is already pointed
# echo "[setup] Obtaining SSL certificate"
# certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect

echo ""
echo "=== Done ==="
echo "Marketplace available at: http://$DOMAIN"
echo ""
echo "Next steps:"
echo "  1. Point DNS A-record for $DOMAIN → $(curl -s ifconfig.me)"
echo "  2. Run: certbot --nginx -d $DOMAIN"
echo "  3. Update marketplace/.env.local URLs to https://"
