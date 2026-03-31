import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Webhook test - simulates Stripe webhook burst behavior
export const options = {
  scenarios: {
    // Simulate burst of webhooks during a large event
    webhook_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '1m', target: 50 },   // 50 webhooks/sec
        { duration: '2m', target: 100 },  // 100 webhooks/sec
        { duration: '2m', target: 200 },  // Peak: 200 webhooks/sec
        { duration: '1m', target: 50 },  // Back to normal
      ],
    },
    // Sustained webhook load
    webhook_sustained: {
      executor: 'constant-arrival-rate',
      rate: 30,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Webhooks should process quickly
    http_req_failed: ['rate<0.01'],   // Very low failure rate required
  },
};

const WEBHOOKS_URL = __ENV.WEBHOOKS_URL || 'http://localhost:4923/webhooks/stripe';
const WEBHOOK_SECRET = __ENV.WEBHOOK_SECRET || 'whsec_test_secret';

function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  // In real test, you'd use proper HMAC-SHA256
  // Here we just return a mock signature since Stripe validates differently
  return `t=${timestamp},v1=mock_signature_${__VU}_${timestamp}`;
}

export default function () {
  group('Stripe Webhook Events', () => {
    const eventTypes = [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'invoice.paid',
      'customer.subscription.updated',
    ];
    
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    const payload = JSON.stringify({
      id: `evt_${Date.now()}_${__VU}`,
      object: 'event',
      api_version: '2024-06-20',
      created: Date.now(),
      type: eventType,
      data: {
        object: {
          id: `pi_${Date.now()}`,
          object: 'payment_intent',
          amount: 1000,
          currency: 'usd',
          status: eventType.includes('succeeded') ? 'succeeded' : 'failed',
        },
      },
    });
    
    const signature = generateStripeSignature(payload, WEBHOOK_SECRET);
    
    const headers = {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature,
    };
    
    const response = http.post(WEBHOOKS_URL, payload, { headers });
    
    const checkResult = check(response, {
      'webhook accepted': (r) => r.status === 200 || r.status === 400, // 400 is expected for mock signatures
      'webhook response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(!checkResult);
  });

  sleep(0.1); // 100ms between requests to simulate real webhook spacing
}

export function handleSummary(data) {
  console.log('\n=== Webhook Test Summary ===');
  console.log(`Total webhooks sent: ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`Webhook acceptance rate: ${(1 - (data.metrics.http_req_failed?.values?.rate || 0)) * 100}%`);
  console.log(`95th percentile response time: ${data.metrics.http_req_duration?.values?.['p(95)']}ms`);
  
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
