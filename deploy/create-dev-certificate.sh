#!/bin/sh
# Creates a self-signed TLS certificate for localhost in ./certs, for running
# the Docker Compose stack locally. Browsers warn about it once. For a
# certificate they trust, use mkcert instead (see docs/deployment.md).
#
# Never use this certificate anywhere but your own machine.
set -eu

cd "$(dirname "$0")/.."
mkdir -p certs

if [ -f certs/tls.crt ] && [ -f certs/tls.key ]; then
    echo "certs/tls.crt and certs/tls.key already exist. Delete them to create new ones."
    exit 0
fi

# MSYS_NO_PATHCONV stops Git Bash on Windows from turning /CN=... into a path.
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
    -keyout certs/tls.key -out certs/tls.crt \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# nginx runs as an unprivileged user (uid 101), which must be able to read the key.
chmod 644 certs/tls.key certs/tls.crt

echo "Created certs/tls.crt and certs/tls.key for localhost."
