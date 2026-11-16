FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/campus-smart-dispatch-platform.sqlite
ENV SECRETS_PATH=/app/data/.secrets-key

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data/uploads /app/data/backups
VOLUME ["/app/data"]
EXPOSE 3001

CMD ["npm", "start"]
