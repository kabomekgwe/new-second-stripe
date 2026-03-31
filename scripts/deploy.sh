#!/bin/bash
# ============================================
# Production Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-staging}"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    log_error "Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

log_info "Starting deployment to $ENVIRONMENT..."
log_info "Using compose file: $(basename "$COMPOSE_FILE")"

# Check if Docker is installed and running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    log_error "docker-compose is not installed"
    exit 1
fi

# Check if secrets are configured
log_info "Checking Docker secrets..."
REQUIRED_SECRETS=("db_password" "session_secret" "stripe_secret_key")
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! docker secret ls | grep -q "\s${secret}\s"; then
        log_error "Docker secret '$secret' is not configured"
        log_info "Run: ./scripts/setup-docker-secrets.sh"
        exit 1
    fi
done
log_success "All required secrets configured"

# Backup database before production deployment
if [[ "$ENVIRONMENT" == "production" ]]; then
    log_info "Creating pre-deployment backup..."
    $SCRIPT_DIR/backup-database.sh || {
        log_error "Backup failed. Aborting deployment."
        exit 1
    }
fi

# Pull latest images
log_info "Pulling latest images..."
log_info "This may take a few minutes..."
docker-compose -f "$COMPOSE_FILE" pull || {
    log_warn "Some images may need to be built locally"
}

# Rolling update - update database first
log_info "Starting database migration..."
docker-compose -f "$COMPOSE_FILE" up -d postgres || {
    log_error "Failed to start database"
    exit 1
}

# Wait for database to be ready
log_info "Waiting for database..."
sleep 10

# Run migrations
log_info "Running database migrations..."
docker-compose -f "$COMPOSE_FILE" run --rm core-backend npx typeorm migration:run || {
    log_error "Migration failed. Check logs with: docker-compose -f docker-compose.prod.yml logs core-backend"
    exit 1
}
log_success "Migrations completed"

# Deploy webhooks backend first (only 1 replica)
log_info "Deploying webhooks backend..."
docker-compose -f "$COMPOSE_FILE" up -d webhooks-backend || {
    log_error "Failed to deploy webhooks backend"
    exit 1
}
sleep 5

# Health check for webhooks
log_info "Health checking webhooks backend..."
if docker-compose -f "$COMPOSE_FILE" exec -T webhooks-backend wget -q --spider http://localhost:4923/; then
    log_success "Webhooks backend is healthy"
else
    log_error "Webhooks backend health check failed"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50 webhooks-backend
    exit 1
fi

# Deploy core backend (rolling update style)
log_info "Deploying core backend..."
docker-compose -f "$COMPOSE_FILE" up -d --scale core-backend=1 core-backend || {
    log_error "Failed to deploy core backend"
    exit 1
}
sleep 10

# Health check for core backend
log_info "Health checking core backend..."
if docker-compose -f "$COMPOSE_FILE" exec -T core-backend wget -q --spider http://localhost:4917/; then
    log_success "Core backend is healthy"
else
    log_error "Core backend health check failed"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50 core-backend
    exit 1
fi

# Deploy frontend
log_info "Deploying frontend..."
docker-compose -f "$COMPOSE_FILE" up -d frontend || {
    log_error "Failed to deploy frontend"
    exit 1
}
sleep 5

# Health check for frontend
log_info "Health checking frontend..."
if docker-compose -f "$COMPOSE_FILE" exec -T frontend wget -q --spider http://localhost:3000/; then
    log_success "Frontend is healthy"
else
    log_error "Frontend health check failed"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50 frontend
    exit 1
fi

# Start reverse proxy
log_info "Deploying reverse proxy (Traefik)..."
docker-compose -f "$COMPOSE_FILE" up -d traefik || {
    log_warn "Traefik deployment failed (may be already running)"
}

# Start backup service
log_info "Starting backup service..."
docker-compose -f "$COMPOSE_FILE" up -d backup || {
    log_warn "Backup service did not start (non-critical)"
}

# Cleanup old images
log_info "Cleaning up old images..."
docker system prune -f || true

# Output deployment status
log_success "Deployment to $ENVIRONMENT completed successfully!"
echo ""
log_info "Service Status:"
docker-compose -f "$COMPOSE_FILE" ps
echo ""
log_info "Container Resources:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" || true
echo ""
log_info "Health Check URLs:"
echo "  - Core Backend: http://yourdomain.com/api/health"
echo "  - Webhooks: https://webhooks.yourdomain.com/webhooks/stripe"
echo "  - Frontend: https://yourdomain.com"
echo ""
log_info "Monitoring:"
echo "  - Traefik Dashboard: http://localhost:8080 (if exposed)"
echo "  - Docker Logs: docker-compose -f docker-compose.prod.yml logs -f [service]"
echo ""
log_info "Rollback (if needed):"
echo "  docker-compose -f docker-compose.prod.yml down"
echo "  # Restore database from backup"
echo "  gunzip < backups/backup_YYYYMMDD_HHMMSS.sql.gz | docker exec -i postgres-prod psql -U postgres -d stripe_app"
echo ""
