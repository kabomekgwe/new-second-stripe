#!/bin/bash
# ============================================
# Run E2E Tests Script
# Usage: ./scripts/run-e2e-tests.sh [test-pattern]
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "Stripe Payment App - E2E Test Runner"
echo "============================================"
echo ""

# Check if services are running
echo "🔍 Checking if services are running..."

if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Frontend not running at http://localhost:3000${NC}"
    echo "   Starting services with docker-compose..."
    docker-compose -f docker-compose.yml up -d
    echo "   Waiting for services to start..."
    sleep 10
fi

if ! curl -s http://localhost:4917 > /dev/null 2>&1; then
    echo -e "${RED}❌ Core backend not responding at http://localhost:4917${NC}"
    echo "   Please ensure services are running before running tests."
    exit 1
fi

echo -e "${GREEN}✅ Services are running${NC}"
echo ""

# Install dependencies if needed
cd e2e-tests
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if Playwright browsers are installed
if [ ! -d "$HOME/Library/Caches/ms-playwright" ] && [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "🔧 Installing Playwright browsers..."
    npx playwright install
    echo ""
fi
echo ""

# Run tests
export BASE_URL="http://localhost:3000"
export API_URL="http://localhost:4917"

TEST_PATTERN="${1:-}"

if [ -n "$TEST_PATTERN" ]; then
    echo "🧪 Running E2E tests matching: $TEST_PATTERN"
    TEST_PATTERN="$TEST_PATTERN" npx playwright test --grep "$TEST_PATTERN"
else
    echo "🧪 Running all E2E tests..."
    npx playwright test
fi

# Check test result
TEST_RESULT=$?

echo ""
echo "============================================"
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo -e "${RED}❌ Some tests failed${NC}"
fi
echo "============================================"
echo ""
echo "📊 Open report: npx playwright show-report"
echo "📸 Screenshots: e2e-tests/test-results/"
echo ""

exit $TEST_RESULT
