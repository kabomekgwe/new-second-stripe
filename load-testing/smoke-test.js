import http from 'k6/http';
import { check, group } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Smoke test configuration - minimal load to verify system is working
export const options = {
  vus: 1,          // 1 virtual user
  iterations: 1,   // Run once
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    errors: ['rate<0.01'],              // Less than 1% error rate
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4917';

export default function () {
  group('Health Checks', () => {
    // Core backend health
    const coreHealth = http.get(`${BASE_URL}/`);
    const coreCheck = check(coreHealth, {
      'core backend is status 200': (r) => r.status === 200,
      'core backend response time < 500ms': (r) => r.timings.duration < 500,
    });
    errorRate.add(!coreCheck);
  });

  group('API Endpoints', () => {
    // CSRF token endpoint
    const csrfResponse = http.get(`${BASE_URL}/csrf/token`);
    const csrfCheck = check(csrfResponse, {
      'csrf endpoint is status 200': (r) => r.status === 200,
      'csrf token is present': (r) => r.json('token') !== undefined,
    });
    errorRate.add(!csrfCheck);
  });

  group('Metrics Endpoint', () => {
    const metricsResponse = http.get(`${BASE_URL}/metrics`);
    const metricsCheck = check(metricsResponse, {
      'metrics endpoint is status 200': (r) => r.status === 200,
      'metrics include nodejs_version': (r) => r.body.includes('nodejs_version'),
    });
    errorRate.add(!metricsCheck);
  });
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
