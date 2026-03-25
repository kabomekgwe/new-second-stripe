FROM node:22-alpine AS base

# Build shared package
FROM base AS shared
WORKDIR /app/shared
COPY shared/package.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm install && npm run build

# Build frontend
FROM base AS build
WORKDIR /app
COPY --from=shared /app/shared ./shared
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_CORE_API_URL=http://localhost:4917
ENV NEXT_PUBLIC_CORE_API_URL=$NEXT_PUBLIC_CORE_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RUN npm run build

# Production
FROM base AS production
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./.next/static
COPY --from=build /app/frontend/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
