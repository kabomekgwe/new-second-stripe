#!/bin/bash
# ============================================
# Setup Stripe Billing Meter via API
# Usage: ./scripts/setup-stripe-billing-meter.sh
# Requires: stripe-cli and jq installed
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
echo "Stripe Billing Meter Setup"
echo "=========================================="
echo ""

# Check dependencies
if ! command -v stripe &> /dev/null; then
    log_error "stripe-cli is not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log_error "jq is not installed. Run: sudo apt-get install jq"
    exit 1
fi

# Get Stripe Secret Key
if [ -z "$STRIPE_SECRET_KEY" ]; then
    log_info "Enter your Stripe Secret Key (sk_live_...):"
    read -rs STRIPE_SECRET_KEY
    echo ""
fi

export STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY"

# Check if already configured
log_info "Checking existing billing meters..."
EXISTING_METERS=$(stripe billing_meters list --limit 10 2>/dev/null || echo "")

if [ -n "$EXISTING_METERS" ]; then
    log_info "Existing billing meters:"
    echo "$EXISTING_METERS"
    echo ""
    log_warn "Do you want to create a new billing meter? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Skipping billing meter creation"
        exit 0
    fi
fi

# Create Billing Meter
log_info "Creating billing meter..."
log_info "This will create a metered pricing for monthly management fees"
echo ""

# Create the billing meter
METER_RESPONSE=$(stripe billing_meters create \
    --display-name="Monthly Management Fee" \
    --event-name="monthly_management_fee" \
    --default-aggregation="sum" \
    --json 2>/dev/null)

if [ $? -ne 0 ]; then
    log_error "Failed to create billing meter"
    log_info "Note: Billing meters require Stripe Billing to be enabled"
    exit 1
fi

METER_ID=$(echo "$METER_RESPONSE" | jq -r '.id')
METER_DISPLAY_NAME=$(echo "$METER_RESPONSE" | jq -r '.display_name')

log_success "Billing Meter created successfully!"
log_info "Meter ID: $METER_ID"
log_info "Display Name: $METER_DISPLAY_NAME"
echo ""

# Create a price that uses this meter
log_info "Creating a price for the billing meter..."
log_info "Enter the price amount per unit (in cents, e.g., 1250 for $12.50):"
read -r PRICE_AMOUNT

if [ -z "$PRICE_AMOUNT" ]; then
    log_warn "No price amount entered, skipping price creation"
    PRICE_ID=""
else
    # Create the price
    PRICE_RESPONSE=$(stripe prices create \
        --currency="usd" \
        --unit-amount="$PRICE_AMOUNT" \
        --recurring="interval=month" \
        --usage-type="metered" \
        --billing-meter="$METER_ID" \
        --json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        PRICE_ID=$(echo "$PRICE_RESPONSE" | jq -r '.id')
        log_success "Price created successfully!"
        log_info "Price ID: $PRICE_ID"
    else
        log_error "Failed to create price"
        PRICE_ID=""
    fi
fi

echo ""
echo "=========================================="
echo "Billing Meter Configuration Complete"
echo "=========================================="
echo ""
echo "Add these to your environment:"
echo ""
echo "STRIPE_BILLING_METER_ID=$METER_ID"
if [ -n "$PRICE_ID" ]; then
    echo "STRIPE_BILLING_METERED_PRICE_ID=$PRICE_ID"
fi
echo ""
echo "Or add to Docker secrets:"
echo "echo '$METER_ID' | docker secret create stripe_meter_id -"
if [ -n "$PRICE_ID" ]; then
    echo "echo '$PRICE_ID' | docker secret create stripe_price_id -"
fi
echo ""
echo "Verify in Stripe Dashboard:"
echo "https://dashboard.stripe.com/settings/billing/meters"
echo ""
