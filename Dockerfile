# ---- build: install, test, bundle ----
FROM node:22-slim AS build
WORKDIR /app
# Playwright is only used by the e2e script; never download browsers into the image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
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
# The app runs as the built-in "node" user (uid 1000). A host folder bind-mounted on /data
# needs to be writable by that uid, e.g. chown 1000:1000 on the host folder.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/index.js"]
