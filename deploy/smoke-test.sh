#!/bin/sh
# Checks a running Docker Compose stack from the outside, through nginx:
# HTTPS, the redirect, security and cache headers, the SPA fallback, the API
# proxy and the API's trust in the proxy. Run from the repository root after
# `docker compose up`. Reads .env for PUBLIC_ORIGIN, the ports and, if set,
# the seed admin used for the checks that need to sign in.
#
#   sh deploy/smoke-test.sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

origin="${PUBLIC_ORIGIN:-https://localhost:8443}"
http_port="${HTTP_PORT:-8080}"
cert="${TLS_CERT_DIR:-./certs}/tls.crt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

# The certificate is checked against the local one, never skipped.
fetch() {
    curl --silent --show-error --cacert "$cert" --dump-header "$work/headers" --output "$work/body" "$@"
}

header() {
    grep -i "^$1:" "$work/headers" | head -n 1 | cut -d ' ' -f 2- | tr -d '\r'
}

status() {
    head -n 1 "$work/headers" | cut -d ' ' -f 2
}

check() {
    description="$1"
    shift
    if "$@"; then
        echo "ok   $description"
    else
        echo "FAIL $description"
        failures=$((failures + 1))
    fi
}

# Plain HTTP redirects to the public origin, keeping the path.
curl --silent --dump-header "$work/headers" --output /dev/null "http://localhost:$http_port/admin/users?x=1"
check "HTTP redirects to HTTPS" [ "$(status)" = "301" ]
check "redirect keeps the path" [ "$(header Location)" = "$origin/admin/users?x=1" ]

fetch "$origin/"
check "index.html is served" [ "$(status)" = "200" ]
check "index.html is always revalidated" [ "$(header Cache-Control)" = "no-cache" ]
check "X-Content-Type-Options is set" [ "$(header X-Content-Type-Options)" = "nosniff" ]
check "X-Frame-Options is set" [ "$(header X-Frame-Options)" = "DENY" ]
check "Referrer-Policy is set" [ "$(header Referrer-Policy)" = "no-referrer" ]
csp="$(header Content-Security-Policy)"
check "CSP blocks everything not allowed" sh -c "echo \"\$0\" | grep -q \"default-src 'none'\"" "$csp"

# The CSP must allow exactly the inline scripts in the served page.
expected_hashes="$(node frontend/resource-reservation-client/scripts/csp-script-hashes.mjs "$work/body")"
check "CSP allows the inline theme script by hash" [ -n "$expected_hashes" ]
check "CSP script-src matches the served page" sh -c "echo \"\$0\" | grep -q \"script-src 'self' \$1;\"" "$csp" "$expected_hashes"

fetch "$origin/admin/users"
check "unknown paths get index.html" sh -c "[ \"\$0\" = 200 ] && grep -q '<div id=\"root\">' \"\$1\"" "$(status)" "$work/body"

asset="$(grep -o '/assets/[^"]*\.js' "$work/body" | head -n 1)"
fetch "$origin$asset"
check "hashed assets are served" [ "$(status)" = "200" ]
check "hashed assets are cached as immutable" [ "$(header Cache-Control)" = "public, max-age=31536000, immutable" ]

fetch "$origin/assets/missing-file.js"
check "a missing asset is a 404, not index.html" [ "$(status)" = "404" ]

fetch "$origin/health/ready"
check "/health/ready reaches the API" sh -c "[ \"\$0\" = 200 ] && grep -q Healthy \"\$1\"" "$(status)" "$work/body"

fetch "$origin/api/resources"
check "/api reaches the API" [ "$(status)" = "200" ]
check "API responses keep the API's own headers" [ "$(header Cache-Control)" = "no-store" ]

# Signing in and creating a resource checks that the API's database login can
# write, and the Location header shows whether the API trusts nginx's
# X-Forwarded-Proto: it is https only if it does.
if [ -n "${SEED_ADMIN_EMAIL:-}" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
    credentials="{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}"

    # A bearer token, as a client other than a browser signs in.
    fetch "$origin/api/auth/token" -H 'Content-Type: application/json' --data "$credentials"
    check "the seed admin can get a bearer token" [ "$(status)" = "200" ]
    token="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$work/body")"

    fetch "$origin/api/resources" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
        --data '{"name":"Smoke test resource"}'
    check "the API can write to the database" [ "$(status)" = "201" ]
    location="$(header Location)"
    check "the API sees the original scheme and host" sh -c "echo \"\$0\" | grep -q \"^\$1/api/resources/\"" "$location" "$origin"

    fetch "$location" -X DELETE -H "Authorization: Bearer $token"
    check "the smoke test resource is removed again" [ "$(status)" = "204" ]

    # A browser session over HTTPS through nginx, with a cookie jar and the
    # Origin and Sec-Fetch-Site headers a browser sends (ADR 0012).
    jar="$work/cookies"
    browser() {
        fetch "$@" --cookie "$jar" --cookie-jar "$jar" -H "Origin: $origin" -H 'Sec-Fetch-Site: same-origin'
    }
    csrf_token() {
        browser "$origin/api/auth/csrf"
        sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$work/body"
    }

    browser "$origin/api/auth/login" -H 'Content-Type: application/json' --data "$credentials"
    check "signing in without an anti-forgery token is refused" [ "$(status)" = "403" ]

    browser "$origin/api/auth/login" -H 'Content-Type: application/json' \
        -H "X-CSRF-TOKEN: $(csrf_token)" --data "$credentials"
    check "the seed admin can sign in in a browser" [ "$(status)" = "200" ]
    session_cookie="$(grep -i '^set-cookie: __Host-rr-session=' "$work/headers" | tr -d '\r' | tr 'A-Z' 'a-z')"
    check "the session cookie is __Host-, Secure, HttpOnly and SameSite=Strict" sh -c \
        "echo \"\$0\" | grep -q 'secure' && echo \"\$0\" | grep -q 'httponly' && echo \"\$0\" | grep -q 'samesite=strict' && echo \"\$0\" | grep -q 'path=/'" \
        "$session_cookie"
    check "the sign-in response contains no token" sh -c "! grep -qi '\"token\"' \"\$0\"" "$work/body"
    stolen_cookie="$(grep -i '__Host-rr-session' "$jar" | awk '{print $NF}')"

    browser "$origin/api/auth/me"
    check "the cookie restores the session" sh -c "[ \"\$0\" = 200 ] && grep -q \"\$1\" \"\$2\"" "$(status)" "$SEED_ADMIN_EMAIL" "$work/body"

    browser "$origin/api/resources" -H 'Content-Type: application/json' -H 'X-CSRF-TOKEN: forged' \
        --data '{"name":"Forged"}'
    check "a request with a forged anti-forgery token is refused" [ "$(status)" = "403" ]

    fetch "$origin/api/resources" --cookie "$jar" -H 'Origin: https://evil.example' -H 'Sec-Fetch-Site: cross-site' \
        -H 'Content-Type: application/json' -H "X-CSRF-TOKEN: $(csrf_token)" --data '{"name":"Cross-site"}'
    check "a cross-site request is refused, even with a valid token" [ "$(status)" = "403" ]

    browser "$origin/api/auth/logout" -X POST -H "X-CSRF-TOKEN: $(csrf_token)"
    check "signing out succeeds" [ "$(status)" = "204" ]
    fetch "$origin/api/auth/me" -H "Cookie: __Host-rr-session=$stolen_cookie"
    check "a copy of the signed-out cookie no longer works" [ "$(status)" = "401" ]
else
    echo "skip sign-in checks: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are not set"
fi

if [ "$failures" -gt 0 ]; then
    echo "$failures check(s) failed."
    exit 1
fi

echo "All checks passed."
