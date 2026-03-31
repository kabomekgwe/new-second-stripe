import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Stress test - find the breaking point
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Normal load
    { duration: '5m', target: 100 },   // Sustain
    { duration: '2m', target: 200 },   // Above normal
    { duration: '5m', target: 200 },     // Sustain
    { duration: '2m', target: 300 },     // Approaching limit
    { duration: '5m', target: 300 },     // Sustain at limit
    { duration: '2m', target: 400 },     // Breaking point
    { duration: '5m', target: 400 },     // Can it handle it?
    { duration: '5m', target: 0 },       // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // More lenient during stress
    http_req_failed: ['rate<0.20'],     // Allow up to 20% failures
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4917';

export default function () {
  group('Stress Test - Heavy Load', () => {
    // Multiple concurrent requests
    const requests = [
      { method: 'GET', url: `${BASE_URL}/` },
      { method: 'GET', url: `${BASE_URL}/csrf/token` },
      { method: 'GET', url: `${BASE_URL}/metrics` },
      { method: 'POST', url: `${BASE_URL}/auth/register` }, // This will fail duplicates, which is expected
    ];
    
    const responses = http.batch(requests);
    
    // Check that the server is still responding (even if some requests fail)
    const healthCheck = check(responses[0], {
      'server is responding': (r) => r.status < 500,
      'response time < 5000ms': (r) => r.timings.duration < 5000,
    });
    
    errorRate.add(!healthCheck);
  });

  // Small sleep to prevent overwhelming the server immediately
  sleep(Math.random() * 2);
}

export function handleSummary(data) {
  console.log('\n=== Stress Test Summary ===');
  console.log(`Peak concurrent users: ${data.metrics.vus_max.values.max}`);
  console.log(`Failed Requests: ${data.metrics.http_req_failed.values.rate * 100}%`);
  console.log(`95th Percentile: ${data.metrics.http_req_duration.values['p(95)']}ms`);
  console.log(`Error Rate: ${data.metrics.errors.values.rate * 100}%`);
  
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
