FROM node:22-alpine AS base

# Build frontend
FROM base AS build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ .
ENV NEXT_TELEMETRY_DISABLED=1
ARG CORE_API_URL=http://localhost:4917
ENV CORE_API_URL=$CORE_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RUN npm run build

# Production
FROM base AS production
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001

COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./.next/static
COPY --from=build /app/frontend/public ./public

# Security: Set ownership
RUN chown -R nodeuser:nodejs /app/frontend

USER nodeuser

EXPOSE 3000
CMD ["node", "server.js"]
