# One build, two images: `web` (Next.js standalone) and `worker` (dispatch / poll / reconcile + migrations).
# Both carry the commit they were built from, so prod can be asked what it is running.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Route modules read AUTH_SECRET when Next collects page data; the real one only exists at runtime.
RUN AUTH_SECRET=build-time-placeholder-not-used-at-runtime pnpm build

FROM node:22-alpine AS web
ARG REVISION=unknown
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production PORT=3400 HOSTNAME=0.0.0.0 APP_REVISION=$REVISION
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3400
CMD ["node", "server.js"]

FROM base AS worker
ARG REVISION=unknown
LABEL org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production APP_REVISION=$REVISION
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
USER node
CMD ["node_modules/.bin/tsx", "src/worker/main.ts"]
