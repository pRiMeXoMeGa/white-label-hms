# ---- build: install, test, bundle ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# ---- runtime: only the bundle and the hotel config, no node_modules ----
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/hms.sqlite \
    HOTEL_CONFIG_PATH=/app/config/hotel.json \
    CLIENT_DIR=/app/dist/client
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY config ./config
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/index.js"]
