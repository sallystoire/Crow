FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @workspace/api-server run build

FROM node:22-slim AS runner
WORKDIR /app

COPY --from=builder /app/artifacts/api-server/dist ./dist

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
