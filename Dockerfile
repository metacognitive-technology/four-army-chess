# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (devDeps required for the build step)
COPY package*.json ./
RUN npm ci

# Copy source and build frontend + server bundle
COPY . .
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only runtime dependencies
# Most server deps are bundled by esbuild, but this covers any CJS externals.
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Frontend static files + server bundle
COPY --from=builder /app/dist ./dist

# In production the bundle lives at dist/index.cjs so __dirname = /app/dist.
# Both gameManager.ts and routes.ts resolve data paths relative to __dirname,
# which means they look for data files at /app/dist/data/.
COPY --from=builder /app/server/data ./dist/data

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
