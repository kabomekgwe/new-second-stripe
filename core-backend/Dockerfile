FROM node:22-alpine AS base

# Build shared package
FROM base AS shared
WORKDIR /app/shared
COPY shared/package.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm install && npm run build

# Build core-backend
FROM base AS build
WORKDIR /app
COPY --from=shared /app/shared ./shared
WORKDIR /app/core-backend
COPY core-backend/package.json core-backend/tsconfig.json core-backend/tsconfig.build.json core-backend/nest-cli.json ./
RUN npm install
COPY core-backend/src ./src
RUN npm run build

# Production
FROM base AS production
WORKDIR /app
COPY --from=shared /app/shared ./shared
WORKDIR /app/core-backend
COPY --from=build /app/core-backend/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/core-backend/dist ./dist

EXPOSE 4917
CMD ["node", "dist/main.js"]
