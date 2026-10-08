#!/bin/bash
set -euo pipefail

DOMAIN="api.tryurbanlite.in"
EMAIL="ashish.teckfile@gmail.com"
CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY_FILE="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
NGINX_CONF="/etc/nginx/conf.d/https.conf"

if ! command -v certbot >/dev/null 2>&1; then
    dnf install -y certbot
fi

# Request a certificate if this instance doesn't have one.
if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
    # Remove a stale HTTPS config before stopping Nginx.
    rm -f "$NGINX_CONF"

    systemctl stop nginx || true

    restart_nginx() {
        systemctl start nginx || true
    }
    trap restart_nginx EXIT

    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --preferred-challenges http \
        -d "$DOMAIN"

    # Ensure the certificate was actually created.
    test -f "$CERT_FILE"
    test -f "$KEY_FILE"

    trap - EXIT
fi

cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 443 ssl;
    server_name api.tryurbanlite.in;

    ssl_certificate /etc/letsencrypt/live/api.tryurbanlite.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tryurbanlite.in/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://docker;
        proxy_http_version 1.1;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX

mkdir -p /etc/letsencrypt/renewal-hooks/deploy

cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/bash
set -e
/usr/bin/nginx -t
/usr/bin/systemctl reload nginx
HOOK

chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

nginx -t

if systemctl is-active --quiet nginx; then
    systemctl reload nginx
else
    systemctl start nginx
fi

systemctl enable --now certbot-renew.timer