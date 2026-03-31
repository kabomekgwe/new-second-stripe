#!/bin/bash
# ============================================
# Docker Swarm Setup for Production
# Usage: ./scripts/setup-docker-swarm.sh
# Sets up Docker Swarm cluster for container orchestration
# ============================================

set -e

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

echo ""
echo "=========================================="
echo "Docker Swarm Setup"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

# Check current Swarm status
SWARM_STATUS=$(docker info --format '{{.Swarm.LocalNodeState}}')

if [ "$SWARM_STATUS" = "active" ]; then
    log_success "Docker Swarm is already initialized"
    log_info "Current node ID: $(docker info --format '{{.Swarm.NodeID}}')"
    log_info "Manager status: $(docker info --format '{{.Swarm.ControlAvailable}}')"
else
    log_info "Initializing Docker Swarm..."
    
    # Get the IP address
    read -p "Enter the advertise address (IP or hostname): " ADVERTISE_ADDR
    
    if [ -z "$ADVERTISE_ADDR" ]; then
        log_error "Advertise address is required"
        exit 1
    fi
    
    docker swarm init --advertise-addr "$ADVERTISE_ADDR"
    
    log_success "Docker Swarm initialized!"
    
    # Display join token
    log_info ""
    log_info "To add worker nodes, run:"
    log_info ""
    docker swarm join-token worker
    log_info ""
    log_info "To add manager nodes, run:"
    log_info ""
    docker swarm join-token manager
fi

echo ""
log_info "Setting up Docker Swarm networks..."

# Create overlay networks
if ! docker network ls | grep -q "stripe-app_frontend-network"; then
    docker network create \
        --driver=overlay \
        --attachable \
        --scope swarm \
        stripe-app_frontend-network || log_warn "Network may already exist"
fi

if ! docker network ls | grep -q "stripe-app_backend-network"; then
    docker network create \
        --driver=overlay \
        --attachable \
        --internal \
        --scope swarm \
        stripe-app_backend-network || log_warn "Network may already exist"
fi

log_success "Networks configured!"

echo ""
log_info ""
log_info "Docker Swarm Status:"
docker node ls
docker network ls --filter scope=swarm

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Deploy the stack:"
echo "   docker-compose -f docker-compose.prod.yml -f docker-compose.swarm.yml up -d"
echo ""
echo "2. Or use docker stack deploy (for Swarm mode):"
echo "   docker stack deploy -c docker-compose.prod.yml stripe-app"
echo ""
echo "3. Check service status:"
echo "   docker stack ps stripe-app"
echo "   docker service ls"
echo ""
echo "4. Scale a service:"
echo "   docker service scale stripe-app_core-backend=3"
echo ""
