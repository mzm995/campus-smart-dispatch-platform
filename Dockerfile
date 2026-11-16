FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build


FROM node:24-bookworm-slim AS production-deps
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force


FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/campus-smart-dispatch-platform.sqlite
ENV SECRETS_PATH=/app/data/.secrets-key

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/src/mock ./src/mock
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data/uploads /app/data/backups \
    && chown -R node:node /app/data

USER node
EXPOSE 3001
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
