import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

// Load test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp up to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
    http_req_failed: ['rate<0.05'],     // Less than 5% failed requests
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4917';

export default function () {
  group('User Flow - Registration', () => {
    const uniqueEmail = `load-test-${Date.now()}-${__VU}@example.com`;
    
    const payload = JSON.stringify({
      name: 'Load Test User',
      email: uniqueEmail,
      password: 'SecurePass123!',
      country: 'US',
      currency: 'USD',
    });
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    const response = http.post(`${BASE_URL}/auth/register`, payload, { headers });
    
    const checkResult = check(response, {
      'registration is status 201': (r) => r.status === 201,
      'registration response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(!checkResult);
    apiLatency.add(response.timings.duration);
  });

  group('API Operations', () => {
    // CSRF token - high frequency endpoint
    const csrfResponse = http.get(`${BASE_URL}/csrf/token`);
    const csrfCheck = check(csrfResponse, {
      'csrf endpoint is status 200': (r) => r.status === 200,
      'csrf response time < 200ms': (r) => r.timings.duration < 200,
    });
    errorRate.add(!csrfCheck);
    
    // Health check
    const healthResponse = http.get(`${BASE_URL}/`);
    const healthCheck = check(healthResponse, {
      'health endpoint is status 200': (r) => r.status === 200,
    });
    errorRate.add(!healthCheck);
    
    apiLatency.add(csrfResponse.timings.duration);
    apiLatency.add(healthResponse.timings.duration);
  });

  sleep(1);
}

export function handleSummary(data) {
  console.log('\n=== Load Test Summary ===');
  console.log(`Total Requests: ${data.metrics.http_reqs.values.count}`);
  console.log(`Failed Requests: ${data.metrics.http_req_failed.values.rate * 100}%`);
  console.log(`Avg Response Time: ${data.metrics.http_req_duration.values.avg}ms`);
  console.log(`95th Percentile: ${data.metrics.http_req_duration.values['p(95)']}ms`);
  console.log(`Error Rate: ${data.metrics.errors.values.rate * 100}%`);
  
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
