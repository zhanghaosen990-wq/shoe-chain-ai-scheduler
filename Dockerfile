FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY app ./app
COPY data ./data
RUN npm run build

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=4173 \
    PORTAL_STATE_FILE=/app/data/portal-state.json

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/app ./app
COPY --from=build /app/data ./data

RUN mkdir -p /app/data
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "app/server.js"]
