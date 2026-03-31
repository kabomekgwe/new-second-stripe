#!/bin/bash
# Manual Test Script for Payment Method Flow
# Run this after starting all services

set -e

echo "========================================"
echo "Payment Method Flow Manual Test"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test user credentials
TEST_EMAIL="test-payment-$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_NAME="Test Payment User"

echo "Test User: $TEST_EMAIL"
echo ""

# Check services
echo -e "${YELLOW}Checking services...${NC}"
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${RED}✗ Frontend not running on port 3000${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Frontend running${NC}"

if ! curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo -e "${RED}✗ Backend not running on port 3001${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend running${NC}"

if ! curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo -e "${RED}✗ Webhooks backend not running on port 3002${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Webhooks backend running${NC}"
echo ""

# Get CSRF token
echo -e "${YELLOW}Getting CSRF token...${NC}"
CSRF_RESPONSE=$(curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
    http://localhost:3001/csrf/token)
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
    echo -e "${RED}✗ Failed to get CSRF token${NC}"
    echo "Response: $CSRF_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✓ CSRF token obtained${NC}"
echo ""

# Register user
echo -e "${YELLOW}Registering test user...${NC}"
REGISTER_RESPONSE=$(curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
    -X POST http://localhost:3001/auth/register \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"$TEST_NAME\",\"country\":\"US\"}")

echo "Register response: $REGISTER_RESPONSE"

if echo "$REGISTER_RESPONSE" | grep -q "error"; then
    echo -e "${RED}✗ Registration failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ User registered${NC}"
echo ""

# Login
echo -e "${YELLOW}Logging in...${NC}"
LOGIN_RESPONSE=$(curl -s -c /tmp/cookies.txt -b /tmp/cookies.txt \
    -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

echo "Login response: $LOGIN_RESPONSE"

if echo "$LOGIN_RESPONSE" | grep -q "error"; then
    echo -e "${RED}✗ Login failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Logged in${NC}"
echo ""

# Get available payment method types
echo -e "${YELLOW}Getting available payment methods...${NC}"
AVAILABLE_RESPONSE=$(curl -s -b /tmp/cookies.txt \
    http://localhost:3001/payment-methods/available)

echo "Available methods: $AVAILABLE_RESPONSE"

if echo "$AVAILABLE_RESPONSE" | grep -q "card"; then
    echo -e "${GREEN}✓ Card payment method available${NC}"
else
    echo -e "${YELLOW}⚠ Card not in available methods${NC}"
fi
echo ""

# Create setup intent
echo -e "${YELLOW}Creating setup intent...${NC}"
SETUP_RESPONSE=$(curl -s -b /tmp/cookies.txt -X POST \
    http://localhost:3001/payment-methods/setup-intent)

echo "Setup intent response: $SETUP_RESPONSE"

CLIENT_SECRET=$(echo "$SETUP_RESPONSE" | grep -o '"clientSecret":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CLIENT_SECRET" ]; then
    echo -e "${RED}✗ Failed to create setup intent${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Setup intent created${NC}"
echo "Client secret: ${CLIENT_SECRET:0:20}..."
echo ""

# Get payment methods (should be empty)
echo -e "${YELLOW}Checking initial payment methods...${NC}"
PM_RESPONSE=$(curl -s -b /tmp/cookies.txt \
    http://localhost:3001/payment-methods)

echo "Payment methods: $PM_RESPONSE"

if echo "$PM_RESPONSE" | grep -q "\\[\\]"; then
    echo -e "${GREEN}✓ No payment methods (expected)${NC}"
else
    echo -e "${YELLOW}⚠ Payment methods already exist${NC}"
fi
echo ""

echo "========================================"
echo -e "${GREEN}✓ Backend API Tests Passed${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000/auth/register in browser"
echo "2. Register with: $TEST_EMAIL / $TEST_PASSWORD"
echo "3. Navigate to /payment-methods"
echo "4. Click 'Add Payment Method'"
echo "5. Enter test card: 4242424242424242, 12/30, 123"
echo "6. Verify card appears in list"
echo ""
echo "Or run: yarn workspace e2e-tests test tests/complete-user-flow.spec.ts"