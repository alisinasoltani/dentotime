# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG BACKEND_INTERNAL_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STORAGE_ORIGIN
ARG ALLOW_INSECURE_HTTP=false
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STORAGE_ORIGIN=$NEXT_PUBLIC_STORAGE_ORIGIN \
    ALLOW_INSECURE_HTTP=$ALLOW_INSECURE_HTTP \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_API_URL may intentionally be empty when the browser uses the
# same-origin /api rewrite. BACKEND_INTERNAL_URL is still required for SSR.
RUN test -n "$BACKEND_INTERNAL_URL" && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 10001 dentotime \
    && adduser --system --uid 10001 --ingroup dentotime dentotime \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=builder --chown=dentotime:dentotime /app/public ./public
COPY --from=builder --chown=dentotime:dentotime /app/.next/standalone ./
COPY --from=builder --chown=dentotime:dentotime /app/.next/static ./.next/static
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1
CMD ["sh", "-c", "test -n \"$BACKEND_INTERNAL_URL\" || { echo 'BACKEND_INTERNAL_URL is required' >&2; exit 1; }; exec node server.js"]
