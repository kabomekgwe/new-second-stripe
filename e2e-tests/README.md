# E2E Browser Tests for Stripe Payment App

This directory contains end-to-end tests using Playwright that simulate real user interactions.

## Test Scenarios

### `complete-user-flow.spec.ts`
The main test file that covers the entire user journey:

1. **Signup**: Create a new user account
2. **Signin**: Login with credentials
3. **Navigate to Payment Methods**: Access the payment settings
4. **Add Payment Method**: Add a test credit card (4242 4242 4242 4242)
5. **Verify Payment Method**: Confirm the card is saved and visible
6. **Make Payment**: Process a test payment using the saved card
7. **Dashboard Verification**: Confirm transaction appears in dashboard

### Auth Tests (`auth.spec.ts`)
- Registration validation
- Login error handling
- Session persistence
- Protected route access

### Additional Scenarios
- Multiple payment methods
- Declined card handling
- 3D Secure authentication (test mode)

## Running Tests

### Prerequisites
```bash
# Start the full stack
docker-compose -f docker-compose.yml up -d

# Or run in production mode
docker-compose -f docker-compose.prod.yml up -d
```

### Install Dependencies
```bash
cd e2e-tests
npm install
npx playwright install  # Install browsers
```

### Run All Tests
```bash
npm test
```

### Run Specific Test
```bash
# Run only the complete flow test
TEST_PATTERN="Complete User Flow" npm test

# Run with UI mode
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed
```

### Run in CI Mode
```bash
CI=true npm test
```

## Test Credentials

### Stripe Test Cards
- **Successful Payment**: 4242424242424242 (Visa)
- **Requires Auth**: 4000002500003155 (3DS)
- **Declined**: 4000000000000002

### Test User Data
Tests generate unique users automatically: `test-{timestamp}@example.com`

## Environment Variables

```env
BASE_URL=http://localhost:3000
API_URL=http://localhost:4917
TEST_PATTERN=.*       # Regex to filter tests
```

## Test Results

Reports are generated in:
- **HTML Report**: `playwright-report/index.html`
- **JUnit**: `test-results/junit.xml`
- **Screenshots**: `test-results/` (on failure)
- **Videos**: `test-results/` (on failure)
- **Traces**: `test-results/` (on first retry)

## CI Integration

Tests automatically run in GitHub Actions CI pipeline.

## Troubleshooting

### Stripe Elements Not Loading
- Wait longer for iframe to load
- Check Stripe publishable key is configured
- Verify backend is running on port 4917

### Flaky Tests
- Increase timeouts in `playwright.config.ts`
- Check network connection
- Verify database is populated

## Updating Tests

When UI changes, update selectors:
1. Use `data-testid` attributes instead of text
2. Prefer user-facing attributes (`role`, `aria-label`)
3. Add screenshots for debugging
