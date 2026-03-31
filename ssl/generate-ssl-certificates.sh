#!/bin/bash
# ============================================
# Generate SSL Certificates for PostgreSQL
# Usage: ./ssl/generate-ssl-certificates.sh
# Creates self-signed certificates for Postgres SSL
# For production, use Let's Encrypt or proper CA-signed certs
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR"

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

log_info "Generating SSL certificates for PostgreSQL..."
log_warn "WARNING: These are self-signed certificates."
log_warn "For production, use certificates from a proper CA or Let's Encrypt."
echo ""

# Create directories
mkdir -p "$SSL_DIR/certs" "$SSL_DIR/private"

# Generate CA private key
log_info "Generating CA private key..."
openssl genrsa -out "$SSL_DIR/private/ca-key.pem" 4096 2>/devdev/null

# Generate CA certificate
log_info "Generating CA certificate..."
openssl req \
    -new \
    -x509 \
    -days 3650 \
    -key "$SSL_DIR/private/ca-key.pem" \
    -out "$SSL_DIR/certs/ca-cert.pem" \
    -subj "/C=US/ST=State/L=City/O=StripeApp/CN=StripeApp CA" \
    2>/devdev/null

# Generate server private key
log_info "Generating server private key..."
openssl genrsa -out "$SSL_DIR/private/server.key" 4096 2>/devdev/null

# Generate server certificate signing request
log_info "Generating server certificate..."
openssl req \
    -new \
    -key "$SSL_DIR/private/server.key" \
    -out "$SSL_DIR/server.csr" \
    -subj "/C=US/ST=State/L=City/O=StripeApp/CN=postgres" \
    2>/devdev/null

# Sign server certificate with CA
openssl x509 \
    -req \
    -days 365 \
    -in "$SSL_DIR/server.csr" \
    -CA "$SSL_DIR/certs/ca-cert.pem" \
    -CAkey "$SSL_DIR/private/ca-key.pem" \
    -CAcreateserial \
    -out "$SSL_DIR/certs/server.crt" \
    2>/devdev/null

# Set proper permissions
chmod 600 "$SSL_DIR/private/server.key"
chmod 644 "$SSL_DIR/certs/server.crt"
chmod 644 "$SSL_DIR/certs/ca-cert.pem"

# Cleanup
rm -f "$SSL_DIR/server.csr" "$SSL_DIR/certs/ca-cert.srl"

log_success "SSL certificates generated successfully!"
echo ""
echo "Certificate locations:"
echo "  Server certificate: $SSL_DIR/certs/server.crt"
echo "  Server private key: $SSL_DIR/private/server.key"
echo "  CA certificate:     $SSL_DIR/certs/ca-cert.pem"
echo ""
echo "To use with Docker Compose:"
echo "  volumes:"
echo "    - ./ssl/certs/server.crt:/etc/ssl/certs/server.crt:ro"
echo "    - ./ssl/private/server.key:/etc/ssl/private/server.key:ro"
echo ""
