# Martelo FC — imagem de produção (um único processo: site, API, WebSocket e SQLite).
#
# docker build -t martelo-fc .
# docker run -p 8080:8080 -v martelo-data:/data martelo-fc

# --- 1) Compila o site e prepara as dependências de produção -------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Ferramentas para compilar o better-sqlite3 caso não haja binário pronto para a plataforma.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# --- 2) Imagem final, só com o que o servidor usa -------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/martelo.db \
    STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/data ./data
COPY --from=build /app/tsconfig.json ./tsconfig.json
# O banco fica num volume montado em /data (sobrevive a novos deploys).
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8080
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/server/main.ts"]
