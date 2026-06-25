#!/usr/bin/env bash
# One-time setup for marketplace subdomain on VPS.
# Run as root on the server after the first deploy that includes marketplace/.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/deltaproject}"
DOMAIN="marketplace.looneymoon.ru"

echo "=== Marketplace Setup ==="

# 1. Create .env.local for marketplace
echo "[setup] Creating marketplace/.env.local"
cat > "$REPO_DIR/marketplace/.env.local" << EOF
NEXT_PUBLIC_API_BASE_URL=http://37.220.80.62:8000
NEXT_PUBLIC_APP_URL=http://$DOMAIN
NEXT_PUBLIC_MAIN_APP_URL=http://looneymoon.ru
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

# 5. DNS check before certbot
echo "[setup] Checking DNS for $DOMAIN..."
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null || echo "")
SERVER_IP=$(curl -s ifconfig.me)

if [[ "$RESOLVED_IP" == "$SERVER_IP" ]]; then
    echo "[setup] DNS OK ($DOMAIN → $RESOLVED_IP). Getting SSL certificate..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@looneymoon.ru --redirect
    
    # Update .env.local to https after cert is installed
    sed -i 's|http://marketplace.looneymoon.ru|https://marketplace.looneymoon.ru|g' "$REPO_DIR/marketplace/.env.local"
    sed -i 's|http://looneymoon.ru|https://looneymoon.ru|g' "$REPO_DIR/marketplace/.env.local"
    
    # Rebuild with https URLs
    cd "$REPO_DIR/marketplace"
    npm run build
    systemctl restart deltaproject-marketplace.service
    
    echo "[setup] SSL configured! Marketplace at: https://$DOMAIN"
else
    echo "[setup] DNS not pointed yet (got: '$RESOLVED_IP', expected: '$SERVER_IP')"
    echo "[setup] Marketplace running at: http://$DOMAIN (no SSL yet)"
    echo ""
    echo "When DNS is ready, run:"
    echo "  certbot --nginx -d $DOMAIN"
fi

echo ""
echo "=== Setup Complete ==="
