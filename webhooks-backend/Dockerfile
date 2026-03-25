FROM node:22-alpine AS base

# Build shared package
FROM base AS shared
WORKDIR /app/shared
COPY shared/package.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm install && npm run build

# Build webhooks-backend
FROM base AS build
WORKDIR /app
COPY --from=shared /app/shared ./shared
WORKDIR /app/webhooks-backend
COPY webhooks-backend/package.json webhooks-backend/tsconfig.json webhooks-backend/tsconfig.build.json webhooks-backend/nest-cli.json ./
RUN npm install
COPY webhooks-backend/src ./src
RUN npm run build

# Production
FROM base AS production
WORKDIR /app
COPY --from=shared /app/shared ./shared
WORKDIR /app/webhooks-backend
COPY --from=build /app/webhooks-backend/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/webhooks-backend/dist ./dist
RUN apk add --no-cache curl

EXPOSE 4923
CMD ["node", "dist/main.js"]
