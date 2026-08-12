# ─────────────────────────────────────────────────────────────────────────────
# InclusyQ — Multi-stage production Dockerfile
#
# Stages:
#   1. deps      — install all npm dependencies (cached layer)
#   2. builder   — compile frontend (Vite) and type-check API
#   3. production— lean runtime image, no devDeps, no source maps
#
# Build:
#   docker build -t inclusyq:latest .
#
# Run:
#   docker run -p 3000:3000 --env-file .env.production inclusyq:latest
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependency cache ─────────────────────────────────────────────────
FROM node:22-alpine AS deps

# Install OS libs required by native modules (bcrypt needs python/make/g++)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copy manifests first so this layer is cached unless deps change
COPY package.json package-lock.json ./

# Install ALL deps (needed at build time for Vite + TypeScript)
RUN npm ci --frozen-lockfile

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Carry over node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# Build the React frontend (output → dist/)
# VITE_* env vars baked at build time must be passed via --build-arg
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV NODE_ENV=production

RUN npm run build

# ── Stage 3: production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS production

# Install OS libs needed at runtime (bcrypt)
RUN apk add --no-cache libc6-compat tini

WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S inclusyq -u 1001
USER inclusyq

# Copy only production dependencies
COPY --from=deps    --chown=inclusyq:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=inclusyq:nodejs /app/dist         ./dist

# Copy runtime source files (server.ts compiled via tsx at startup)
# Using tsx to run TypeScript directly avoids a separate compile step
# while still supporting the ESM + TypeScript module graph.
COPY --chown=inclusyq:nodejs package.json    ./
COPY --chown=inclusyq:nodejs server.ts       ./
COPY --chown=inclusyq:nodejs tsconfig.json   ./
COPY --chown=inclusyq:nodejs tsconfig.api.json ./
COPY --chown=inclusyq:nodejs api/            ./api/
COPY --chown=inclusyq:nodejs src/types.ts    ./src/types.ts
COPY --chown=inclusyq:nodejs src/types/      ./src/types/
COPY --chown=inclusyq:nodejs src/lib/        ./src/lib/
COPY --chown=inclusyq:nodejs src/utils/      ./src/utils/

# Expose HTTP port
EXPOSE 3000

# Health check — uses the /api/live liveness probe (process-only, no ext deps)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/live | grep -q '"alive":true' || exit 1

# Use tini as PID 1 for proper signal handling + zombie reaping
ENTRYPOINT ["/sbin/tini", "--"]

# Start server with tsx (handles ESM + TypeScript natively)
CMD ["node_modules/.bin/tsx", "server.ts"]
