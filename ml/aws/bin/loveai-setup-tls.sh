#!/bin/bash
# loveAI — issue/renew the Let's Encrypt certificate and switch nginx to HTTPS.
#
# Idempotent: safe to re-run (certbot --keep-until-expiring, config re-installed,
# nginx reloaded only after `nginx -t` passes).
#
# Called automatically by user-data.sh when LETSENCRYPT_EMAIL is set and DNS already
# points at this instance; re-run by hand after DNS propagates:
#   sudo /usr/local/bin/loveai-setup-tls.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/loveai/deploy.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

API_HOST="${API_HOST:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
WEBROOT="${ACME_WEBROOT:-/var/www/certbot}"
SRC_CONF_DIR="${SRC_CONF_DIR:-/opt/loveai/nginx}"
CONF_DEST="${CONF_DEST:-/etc/nginx/conf.d/loveai-api.conf}"
API_PORT="${API_PORT:-8000}"

log() { echo "[loveai-tls] $*"; }
die() { echo "[loveai-tls] ERROR: $*" >&2; exit 1; }

[ -n "$API_HOST" ] || die "API_HOST is empty (set it in $ENV_FILE)"
[ -n "$LETSENCRYPT_EMAIL" ] || die "LETSENCRYPT_EMAIL is empty — Let's Encrypt requires a contact address"

if ! command -v certbot >/dev/null 2>&1; then
  log "installing certbot"
  dnf install -y certbot python3-certbot-nginx
fi

mkdir -p "$WEBROOT/.well-known/acme-challenge"
chmod 755 "$WEBROOT"

# 1. Serve the ACME challenge over plain HTTP first (nginx must already be running
#    with loveai-api.http.conf — user-data.sh installs it before calling us).
install -m 0644 "$SRC_CONF_DIR/loveai-api.http.conf" "$CONF_DEST"
sed -i "s/__API_HOST__/${API_HOST}/g" "$CONF_DEST"
nginx -t
systemctl reload nginx || systemctl restart nginx

# 2. Certificate (webroot mode: certbot never touches our nginx config, so the
#    result is deterministic and reviewable in git).
log "requesting certificate for $API_HOST"
certbot certonly \
  --webroot --webroot-path "$WEBROOT" \
  --domain "$API_HOST" \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos --no-eff-email \
  --non-interactive \
  --keep-until-expiring

LIVE_DIR="/etc/letsencrypt/live/$API_HOST"
[ -f "$LIVE_DIR/fullchain.pem" ] || die "certificate not found at $LIVE_DIR"

# 3. Reload nginx whenever certbot renews (AL2023's certbot package ships no timer
#    for this — certbot-renew.timer exists, but the deploy hook must be ours).
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/bash
/usr/bin/systemctl reload nginx || /usr/bin/systemctl restart nginx
HOOK
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# 4. Swap in the HTTPS server block.
install -m 0644 "$SRC_CONF_DIR/loveai-api.https.conf" "$CONF_DEST"
sed -i "s/__API_HOST__/${API_HOST}/g" "$CONF_DEST"
nginx -t
systemctl reload nginx

log "TLS active. Verify:"
log "  curl -fsS https://$API_HOST/health"
log "  curl -fsS -H \"Authorization: Bearer \$LLM_API_KEY\" -H 'Content-Type: application/json' \\"
log "    -d '{\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}],\"max_tokens\":32}' \\"
log "    https://$API_HOST/v1/chat/completions"
