# Production Runbook

## Quick Reference Commands

### Health Checks
```bash
# Check service status
sudo docker-compose -f docker-compose.prod.yml ps

# Check health endpoints
curl https://yourdomain.com/
curl https://yourdomain.com/api/health
curl https://webhooks.yourdomain.com/webhooks/stripe -X OPTIONS

# Check metrics
curl https://yourdomain.com/api/metrics
```

### Common Operations

#### View Logs
```bash
# All services
sudo docker-compose -f docker-compose.prod.yml logs -f

# Specific service
sudo docker-compose -f docker-compose.prod.yml logs -f core-backend
sudo docker-compose -f docker-compose.prod.yml logs -f webhooks-backend
sudo docker-compose -f docker-compose.prod.yml logs -f frontend
sudo docker-compose -f docker-compose.prod.yml logs -f postgres
sudo docker-compose -f docker-compose.prod.yml logs -f redis

# Last 100 lines
sudo docker-compose -f docker-compose.prod.yml logs --tail=100 core-backend
```

#### Restart Services
```bash
# Restart specific service
sudo docker-compose -f docker-compose.prod.yml restart core-backend

# Restart all services
sudo docker-compose -f docker-compose.prod.yml restart

# Force recreate (useful after config changes)
sudo docker-compose -f docker-compose.prod.yml up -d --force-recreate core-backend
```

#### Scale Services
```bash
# Scale core backend to 3 instances
sudo docker-compose -f docker-compose.prod.yml up -d --scale core-backend=3 core-backend

# Scale frontend
sudo docker-compose -f docker-compose.prod.yml up -d --scale frontend=4 frontend

# Note: Do NOT scale webhooks-backend (must remain at 1)
```

#### Debug Mode
```bash
# Execute shell in container
sudo docker-compose -f docker-compose.prod.yml exec core-backend sh
sudo docker-compose -f docker-compose.prod.yml exec postgres bash
sudo docker-compose -f docker-compose.prod.yml exec redis redis-cli

# View container stats
sudo docker stats

# View container processes
sudo docker-compose -f docker-compose.prod.yml exec core-backend ps aux
```

#### Database Operations
```bash
# Backup database
./scripts/backup-database.sh

# Restore database
./scripts/rollback.sh /backups/backup_YYYYMMDD_HHMMSS.sql.gz

# Access database directly
sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d stripe_app

# Run database query
sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d stripe_app -c "SELECT * FROM users LIMIT 5;"

# Check database size
sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d stripe_app -c "SELECT pg_size_pretty(pg_database_size('stripe_app'));"
```

#### Redis Operations
```bash
# Redis CLI
sudo docker-compose -f docker-compose.prod.yml exec redis redis-cli

# Check memory usage
sudo docker-compose -f docker-compose.prod.yml exec redis redis-cli INFO memory

# Flush all sessions (USE WITH CAUTION!)
sudo docker-compose -f docker-compose.prod.yml exec redis redis-cli FLUSHDB

# Check connected clients
sudo docker-compose -f docker-compose.prod.yml exec redis redis-cli CLIENT LIST
```

### Troubleshooting

#### Service Won't Start
```bash
# Check logs for errors
sudo docker-compose -f docker-compose.prod.yml logs --tail=50 [service-name]

# Check if secrets are set correctly
sudo docker secret ls

# Check Docker network
sudo docker network ls
sudo docker network inspect stripe-app_backend-network

# Prune unused resources
sudo docker system prune -f
```

#### Database Connection Issues
```bash
# Test database connection from core-backend
sudo docker-compose -f docker-compose.prod.yml exec core-backend \
  pg_isready -h postgres -U postgres

# Check if PostgreSQL is accepting connections
sudo docker-compose -f docker-compose.prod.yml exec postgres \
  pg_isready -U postgres

# View database logs
sudo docker-compose -f docker-compose.prod.yml logs postgres
```

#### Webhook Failures
```bash
# Test webhook connectivity
curl -X POST https://webhooks.yourdomain.com/webhooks/stripe \
  -H "Stripe-Signature: test" \
  -d '{"test": true}'

# Check webhook logs
sudo docker-compose -f docker-compose.prod.yml logs -f webhooks-backend

# Verify webhook secretsudo docker-compose -f docker-compose.prod.yml exec webhooks-backend \
  cat /run/secrets/stripe_webhook_secret
```

#### SSL Certificate Issues
```bash
# Check Traefik logs
sudo docker-compose -f docker-compose.prod.yml logs traefik

# Force certificate regeneration
sudo docker volume rm stripe-app_traefik-certs
sudo docker-compose -f docker-compose.prod.yml restart traefik

# Check certificate status
curl -v https://yourdomain.com 2>&1 | grep -E "SSL|certificate"
```

### Monitoring

#### Check Metrics
```bash
# Prometheus
open http://localhost:9090

# Grafana
open https://grafana.yourdomain.com

# cAdvisor (container metrics)
open http://localhost:8080
```

#### Log Aggregation with Loki
```bash
# Query logs via Loki API
curl "http://localhost:3100/loki/api/v1/query_range?query={container_name=~"core-backend|webhooks-backend"}&limit=100"

# Or use Grafana to query logs
```

## Incident Response

### Severity Levels

#### P1 - Critical (Site Down)
1. **Immediate Actions**:
   - Check if services are running: `sudo docker-compose -f docker-compose.prod.yml ps`
   - Check logs: `sudo docker-compose -f docker-compose.prod.yml logs -f`
   - If necessary, restart all services:
     ```bash
     sudo docker-compose -f docker-compose.prod.yml restart
     ```

2. **Communication**:
   - Notify team via Slack immediately
   - Create incident in incident management system
   - Update status page if applicable

#### P2 - Major (Feature Broken)
1. Identify affected service from logs
2. Attempt to restart service
3. If that fails, check for recent deployments
4. Consider rolling back if needed

#### P3 - Minor (Performance Degradation)
1. Check metrics in Grafana
2. Identify resource constraints
3. Scale services if needed
4. Monitor for resolution

### Rollback Procedure

```bash
# Emergency rollback
1. Stop current deployment:
   sudo docker-compose -f docker-compose.prod.yml down

2. Restore database from backup:
   ./scripts/rollback.sh /backups/backup_YYYYMMDD_HHMMSS.sql.gz

3. Or rollback to previous Docker image:
   sudo docker-compose -f docker-compose.prod.yml pull  # Get previous version
   sudo docker-compose -f docker-compose.prod.yml up -d

4. Verify rollback:
   curl https://yourdomain.com/health
```

### Escalation

1. **First Responder** (On-call engineer)
   - Acknowledge incident within 5 minutes
   - Attempt initial diagnosis
   - Escalate if unresolved within 30 minutes

2. **Senior Engineer**
   - Join incident bridge/call
   - Deep dive into root cause
   - Coordinate fix deployment

3. **Team Lead**
   - Customer communication
   - Stakeholder updates
   - Post-mortem scheduling

## Maintenance Windows

### Regular Maintenance
- **Daily**: Automated backups at 02:00 UTC
- **Weekly**: Review logs and metrics
- **Monthly**: Security updates

### Performing Maintenance

```bash
# 1. Announce maintenance window
# 2. Put site in maintenance mode (if supported)
# 3. Perform maintenance tasks

# Update container images
sudo docker-compose -f docker-compose.prod.yml pull
sudo docker-compose -f docker-compose.prod.yml up -d

# Clean up old images
sudo docker system prune -f

# Verify services
sudo docker-compose -f docker-compose.prod.yml ps
```

## Checklist Templates

### Pre-Deployment Checklist
- [ ] All tests passing in CI
- [ ] Security scan passed (Trivy)
- [ ] Database migrations tested
- [ ] Staging deployment successful
- [ ] Rollback plan documented

### Post-Deployment Checklist
- [ ] Health checks passing
- [ ] Smoke tests passing
- [ ] Logs showing no errors
- [ ] Metrics flowing to Prometheus
- [ ] SSL certificates valid
- [ ] Webhooks delivering successfully

### Weekly Review Checklist
- [ ] Review error logs
- [ ] Check disk space (`df -h`)
- [ ] Check memory usage (`free -h`)
- [ ] Review backup status
- [ ] Check SSL certificate expiry
- [ ] Review security updates

