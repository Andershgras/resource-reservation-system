#!/bin/sh
# Runs before the nginx config template is filled in. Stops the container if a
# required setting is missing, instead of serving broken redirects.
set -eu

if [ -z "${PUBLIC_ORIGIN:-}" ]; then
    echo "PUBLIC_ORIGIN is required, such as https://reservations.example.com" >&2
    exit 1
fi

case "$PUBLIC_ORIGIN" in
    https://*) ;;
    *)
        echo "PUBLIC_ORIGIN must start with https://" >&2
        exit 1
        ;;
esac

for file in /etc/nginx/certs/tls.crt /etc/nginx/certs/tls.key; do
    if [ ! -r "$file" ]; then
        echo "$file is missing or unreadable. Mount the TLS certificate and key into /etc/nginx/certs." >&2
        exit 1
    fi
done
