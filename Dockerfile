FROM node:24.19.0-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

FROM base AS web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["pnpm", "start"]

FROM base AS worker
ENV NODE_ENV=production
USER node
CMD ["pnpm", "worker"]

# Generic container hosts build the last stage; default to the complete web app.
# Compose can still select the dedicated web and worker targets above.
FROM web AS app
