# Builds the frontend and serves it with nginx, which also proxies /api and
# /health to the API, so both share one origin. Run from this folder:
#
#   docker build -t resource-reservation-web .
#
# The container needs PUBLIC_ORIGIN and a TLS certificate at runtime. See
# docs/deployment.md.

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The API is on the same origin, under /api.
ENV VITE_API_BASE_URL=/api
RUN npm run build \
    && node scripts/csp-script-hashes.mjs dist/index.html > /tmp/csp-script-hashes

# Runs as the unprivileged nginx user, listening on 8080 (HTTP, redirects only)
# and 8443 (HTTPS).
FROM nginxinc/nginx-unprivileged:stable-alpine AS web

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 nginx/require-settings.sh /docker-entrypoint.d/05-require-settings.sh
COPY --from=build /tmp/csp-script-hashes /tmp/csp-script-hashes
COPY --from=build /app/dist /usr/share/nginx/html

# Put the inline script hashes from this exact build into the CSP.
USER root
RUN sed -i "s|@CSP_SCRIPT_HASHES@|$(cat /tmp/csp-script-hashes)|" /etc/nginx/snippets/security-headers.conf \
    && rm /tmp/csp-script-hashes
USER nginx

# The template's settings. PUBLIC_ORIGIN has no default and must be set.
# Local resolvers let nginx find the API again after it restarts.
ENV API_UPSTREAM=api:8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

EXPOSE 8080 8443
