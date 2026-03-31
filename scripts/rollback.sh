#!/bin/bash
# ============================================
# Production Rollback Script
# Usage: ./scripts/rollback.sh [backup-file]
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    log_error "Usage: $0 <backup-file>"
    log_info "Available backups:"
    ls -lh "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    # Try with backup directory prefix
    if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
    else
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
fi

log_warn "⚠️  ROLLBACK INITIATED"
log_warn "This will restore the database to: $(basename "$BACKUP_FILE")"
log_warn "Current data will be lost. Are you sure? (type 'yes' to continue)"
read -r confirm

if [ "$confirm" != "yes" ]; then
    log_info "Rollback cancelled"
    exit 0
fi

log_info "Stopping services..."
docker-compose -f "$COMPOSE_FILE" down || true

log_info "Starting database..."
docker-compose -f "$COMPOSE_FILE" up -d postgres

log_info "Waiting for database..."
sleep 10

log_info "Restoring from backup..."
gunzip < "$BACKUP_FILE" | docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres

log_success "Database restored successfully!"

log_info "Redeploying services..."
docker-compose -f "$COMPOSE_FILE" up -d

log_success "Rollback completed!"
log_info "Verify services at: https://yourdomain.com"
