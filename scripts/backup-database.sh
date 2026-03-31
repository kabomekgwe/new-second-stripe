#!/bin/bash
# ============================================
# Database Backup Script for Production
# Usage: ./scripts/backup-database.sh
# Cron: 0 2 * * * /path/to/scripts/backup-database.sh
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Container names
POSTGRES_CONTAINER="postgres-prod"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "📦 Starting database backup..."
echo "   Time: $(date)"
echo "   Backup directory: $BACKUP_DIR"

# Get database credentials from Docker secrets
DB_NAME=$(docker exec "$POSTGRES_CONTAINER" cat /run/secrets/db_name)
DB_USER=$(docker exec "$POSTGRES_CONTAINER" cat /run/secrets/db_user)

# Perform backup
echo "   Creating backup dump..."
docker exec "$POSTGRES_CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --verbose \
    --file=/tmp/backup_$DATE.sql

# Compress backup
echo "   Compressing backup..."
docker exec "$POSTGRES_CONTAINER" \
    gzip -9 /tmp/backup_$DATE.sql

# Copy backup from container to host
docker cp "$POSTGRES_CONTAINER:/tmp/backup_$DATE.sql.gz" "$BACKUP_DIR/"

# Remove backup from container
docker exec "$POSTGRES_CONTAINER" rm -f "/tmp/backup_$DATE.sql.gz"

# Upload to cloud storage (optional - configure as needed)
# Uncomment and configure for your cloud provider
# echo "   Uploading to cloud storage..."
# aws s3 cp "$BACKUP_DIR/backup_$DATE.sql.gz" s3://your-bucket/backups/ \
#     --storage-class STANDARD_IA || true

# Cleanup old backups (local)
echo "   Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Output backup statistics
BACKUP_SIZE=$(du -h "$BACKUP_DIR/backup_$DATE.sql.gz" | cut -f1)
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" | wc -l)

echo ""
echo "✅ Backup completed successfully!"
echo "   File: backup_$DATE.sql.gz"
echo "   Size: $BACKUP_SIZE"
echo "   Total backups: $BACKUP_COUNT"
echo "   Time: $(date)"
echo ""
