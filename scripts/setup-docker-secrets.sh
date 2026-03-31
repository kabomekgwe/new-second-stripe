#!/bin/bash
# ============================================
# Setup Docker Secrets for Production
# Usage: ./scripts/setup-docker-secrets.sh
# Requires: Docker Swarm initialized or Docker Compose
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔐 Setting up Docker Secrets for Stripe App Production..."
echo ""

# Check if Docker Swarm is initialized
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
    echo "⚠️  Docker Swarm is not initialized."
    echo "For production, you should initialize Swarm:"
    echo "  docker swarm init"
    echo ""
    echo "Continue with secrets setup? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Exiting..."
        exit 1
    fi
fi

# Create secrets directory if not exists
mkdir -p "$PROJECT_ROOT/.secrets"

# Function to create a secret
create_secret() {
    local secret_name=$1
    local prompt=$2
    local default_value=$3
    
    echo ""
    echo "📌 $prompt"
    
    if [ -f "$PROJECT_ROOT/.secrets/$secret_name" ]; then
        echo "   Secret file exists. Overwrite? (y/n)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            # Just create/update Docker secret from existing file
            if docker secret ls | grep -q "\s${secret_name}\s"; then
                echo "   Docker secret already exists, skipping..."
            else
                cat "$PROJECT_ROOT/.secrets/$secret_name" | docker secret create "$secret_name" -
                echo "   ✅ Docker secret '$secret_name' created"
            fi
            return
        fi
    fi
    
    if [ -n "$default_value" ]; then
        echo "   Default: $default_value"
        echo "   Press Enter to use default, or type new value:"
    else
        echo "   Enter value (will be hidden):"
    fi
    
    read -rs value
    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi
    
    echo -n "$value" > "$PROJECT_ROOT/.secrets/$secret_name"
    
    # Remove old Docker secret if exists
    if docker secret ls | grep -q "\s${secret_name}\s"; then
        echo "   Removing old Docker secret..."
        docker secret rm "$secret_name" >/devdev/null 2>&1 || true
    fi
    
    # Create new Docker secret
    cat "$PROJECT_ROOT/.secrets/$secret_name" | docker secret create "$secret_name" -
    echo "   ✅ Docker secret '$secret_name' created"
}

# Generate random string
generate_random() {
    openssl rand -hex 32
}

echo ""
echo "============================================"
echo "Database Secrets"
echo "============================================"
create_secret "db_name" "PostgreSQL database name" "stripe_app"
create_secret "db_user" "PostgreSQL username" "postgres"
create_secret "db_password" "PostgreSQL password (generate strong password!)" "$(generate_random)"

echo ""
echo "============================================"
echo "Redis Secrets"
echo "============================================"
create_secret "redis_password" "Redis password" "$(generate_random)"
echo "http://:$(cat $PROJECT_ROOT/.secrets/redis_password)@redis:6379" > "$PROJECT_ROOT/.secrets/redis_url"
if docker secret ls | grep -q "\sredis_url\s"; then
    docker secret rm redis_url >/devdev/null 2>&1 || true
fi
cat "$PROJECT_ROOT/.secrets/redis_url" | docker secret create redis_url -

echo ""
echo "============================================"
echo "Application Secrets"
echo "============================================"
create_secret "session_secret" "Session secret (for cookies)" "$(generate_random)"

echo ""
echo "============================================"
echo "Stripe Secrets (CRITICAL - Use REAL values!)"
echo "============================================"
echo "⚠️  IMPORTANT: These should be your LIVE Stripe keys, not test keys!"
echo "Get them from: https://dashboard.stripe.com/apikeys"
echo ""
create_secret "stripe_secret_key" "Stripe Secret Key (sk_live_...)" ""
create_secret "stripe_publishable_key" "Stripe Publishable Key (pk_live_...)" ""
create_secret "stripe_webhook_secret" "Stripe Webhook Secret (whsec_...)" ""
create_secret "stripe_price_id" "Stripe Metered Price ID (price_...)" ""

echo ""
echo "============================================"
echo "Email Secrets"
echo "============================================"
create_secret "resend_api_key" "Resend API Key" ""
create_secret "resend_from_email" "Resend From Email" "billing@yourdomain.com"

echo ""
echo "============================================"
echo "✅ All Docker Secrets Created Successfully!"
echo "============================================"
echo ""
echo "Secret files are stored in: $PROJECT_ROOT/.secrets/"
echo ""
echo "Docker Secrets created:"
docker secret ls --filter name=db_
docker secret ls --filter name=redis_
docker secret ls --filter name=stripe_
docker secret ls --filter name=session_
docker secret ls --filter name=resend_
echo ""
echo "Next steps:"
echo "  1. Deploy with: docker-compose -f docker-compose.prod.yml up -d"
echo "  2. Set up SSL certificates via Traefik/Let's Encrypt"
echo "  3. Configure your domain DNS to point to this server"
echo ""
