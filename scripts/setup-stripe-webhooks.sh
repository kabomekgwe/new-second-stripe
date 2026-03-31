#!/bin/bash
# ============================================
# Setup Stripe Webhooks for Production
# Usage: ./scripts/setup-stripe-webhooks.sh
# Requires: stripe-cli installed on production server
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
echo "Stripe Webhooks Setup for Production"
echo "=========================================="
echo ""

# Check if running in production
if [ -f "/.dockerenv" ]; then
    log_error "This script should be run on the host server, not in a Docker container"
    exit 1
fi

# Check if stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    log_warn "stripe-cli is not installed"
    log_info "Installing stripe-cli..."
    
    # Install stripe-cli (Ubuntu/Debian)
    if command -v apt-get &> /dev/null; then
        curl -s https://packages.stripe.dev/api/security/keypair > /dev/null
        echo "deb https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
        sudo apt-get update
        sudo apt-get install -y stripe
    else
        log_error "Please install stripe-cli manually: https://stripe.com/docs/stripe-cli"
        exit 1
    fi
fi

log_info "stripe-cli version: $(stripe --version)"

# Get webhook URL
log_info ""
read -p "Enter your webhooks domain (e.g., webhooks.yourdomain.com): " WEBHOOK_DOMAIN

if [ -z "$WEBHOOK_DOMAIN" ]; then
    log_error "Domain is required"
    exit 1
fi

WEBHOOK_URL="https://${WEBHOOK_DOMAIN}/webhooks/stripe"

log_info "Webhook URL will be: $WEBHOOK_URL"
log_warn "Make sure your DNS is configured and Traefik SSL is working!"
echo ""

# Check Docker secrets for Stripe keys
log_info "Checking Docker secrets..."
if ! docker secret ls | grep -q "stripe_secret_key"; then
    log_error "Docker secret 'stripe_secret_key' not found"
    log_info "Run: ./scripts/setup-docker-secrets.sh"
    exit 1
fi

STRIPE_SECRET_KEY=$(docker secret inspect --format='{{.Spec.Name}}' stripe_secret_key 2>/dev/null || echo "")
if [ -z "$STRIPE_SECRET_KEY" ]; then
    log_error "Cannot read stripe_secret_key from Docker"
    log_info "Enter your Stripe Secret Key manually (sk_live_...):"
    read -s STRIPE_SECRET_KEY
fi

export STRIPE_API_KEY="$STRIPE_SECRET_KEY"

# List existing webhooks
log_info ""
log_info "Checking existing webhooks..."
stripe webhook_endpoints list --limit 10 || true

echo ""
log_warn "Do you want to:"
echo "  1) Create new webhook endpoint"
echo "  2) Update existing webhook endpoint"
echo "  3) List current webhooks only"
read -p "Select option (1/2/3): " OPTION

# Required webhook events
echo ""
echo "Required webhook events for this application:"
echo "  - setup_intent.succeeded"
echo "  - payment_method.attached"
echo "  - payment_method.detached"
echo "  - payment_intent.succeeded"
echo "  - payment_intent.payment_failed"
echo "  - checkout.session.completed"
echo "  - checkout.session.async_payment_succeeded"
echo "  - checkout.session.async_payment_failed"
echo "  - checkout.session.expired"
echo "  - invoice.finalized"
echo "  - invoice.paid"
echo "  - invoice.payment_failed"
echo "  - customer.subscription.created"
echo "  - customer.subscription.updated"
echo "  - customer.subscription.deleted"

EVENTS=$(cat <<EOF
setup_intent.succeeded,
payment_method.attached,
payment_method.detached,
payment_intent.succeeded,
payment_intent.payment_failed,
checkout.session.completed,
checkout.session.async_payment_succeeded,
checkout.session.async_payment_failed,
checkout.session.expired,
invoice.finalized,
invoice.paid,
invoice.payment_failed,
customer.subscription.created,
customer.subscription.updated,
customer.subscription.deleted
EOF
)

if [ "$OPTION" = "1" ]; then
    log_info "Creating new webhook endpoint..."
    
    # Create webhook endpoint
    WEBHOOK_RESPONSE=$(stripe webhook_endpoints create \
        --url "$WEBHOOK_URL" \
        --enabled-events "$EVENTS" \
        --api-version "2024-06-20" \
        --description "Stripe Payment App Production Webhooks" \
        --format json)
    
    WEBHOOK_ID=$(echo "$WEBHOOK_RESPONSE" | jq -r '.id')
    WEBHOOK_SECRET=$(echo "$WEBHOOK_RESPONSE" | jq -r '.secret')
    
    log_success "Webhook endpoint created!"
    log_info "Webhook ID: $WEBHOOK_ID"
    log_info ""
    log_warn "IMPORTANT: Save this webhook secret!"
    log_warn "Webhook Secret: $WEBHOOK_SECRET"
    log_warn ""
    log_warn "Add this to your Docker secrets:"
    echo "echo '$WEBHOOK_SECRET' | docker secret create stripe_webhook_secret -"
    
    # Save to file
    echo "$WEBHOOK_SECRET" > "/tmp/stripe_webhook_secret_$WEBHOOK_ID.txt"
    log_info "Secret also saved to: /tmp/stripe_webhook_secret_$WEBHOOK_ID.txt"
    
elif [ "$OPTION" = "2" ]; then
    read -p "Enter webhook endpoint ID (we_...): " WEBHOOK_ID
    
    if [ -z "$WEBHOOK_ID" ]; then
        log_error "Webhook ID is required"
        exit 1
    fi
    
    log_info "Updating webhook endpoint $WEBHOOK_ID..."
    
    stripe webhook_endpoints update "$WEBHOOK_ID" \
        --url "$WEBHOOK_URL" \
        --enabled-events "$EVENTS"
    
    log_success "Webhook endpoint updated!"
    log_warn "Note: The webhook secret remains the same"
    
else
    log_info "Listing current webhook endpoints..."
    stripe webhook_endpoints list --limit 10
fi

# Test webhook connectivity
echo ""
log_info "Testing webhook connectivity..."
curl -s -o /dev/null -w "%{http_code}" "$WEBHOOK_URL" || true

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Add the webhook secret to Docker:"
echo "   echo 'whsec_...' | docker secret create stripe_webhook_secret -"
echo ""
echo "2. Restart webhooks service to pick up the secret:"
echo "   docker-compose -f docker-compose.prod.yml restart webhooks-backend"
echo ""
echo "3. Test webhook delivery in Stripe Dashboard:"
echo "   https://dashboard.stripe.com/webhooks"
echo ""
echo "4. Verify webhook secret is set correctly:"
echo "   docker exec webhooks-backend cat /run/secrets/stripe_webhook_secret"
echo ""
