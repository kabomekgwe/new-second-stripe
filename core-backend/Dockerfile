FROM node:22-alpine AS base

# Build core-backend
FROM base AS build
WORKDIR /app/core-backend
COPY core-backend/package.json core-backend/tsconfig.json core-backend/tsconfig.build.json core-backend/nest-cli.json ./
RUN npm install
COPY core-backend/src ./src
RUN npm run build

# Production
FROM base AS production
WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001

WORKDIR /app/core-backend
COPY --from=build /app/core-backend/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/core-backend/dist ./dist
RUN apk add --no-cache curl && rm -rf /var/cache/apk/*

# Security: Set ownership
RUN chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 4917
CMD ["node", "dist/main.js"]
