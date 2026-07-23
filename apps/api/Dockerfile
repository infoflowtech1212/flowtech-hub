# FlowTech Hub — single-origin container (BFF serves the built SPA).
# Build the whole workspace, then ship a slim runtime that serves /api, /auth
# AND the React app from one origin (required by the strict session cookie).
FROM node:20-alpine AS build
WORKDIR /repo
# Manifests first for cached installs
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install
# Sources + build (shared → api → web)
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
# Single-origin: the BFF serves the SPA from this path.
ENV SERVE_WEB=true
ENV WEB_DIST=/repo/apps/web/dist
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/web/dist ./apps/web/dist
EXPOSE 4000
# App Service / container hosts set PORT; the app reads API_PORT — map if needed.
CMD ["node", "apps/api/dist/index.js"]
