/**
 * Country-specific Stripe payment method availability.
 *
 * Forward mapping: each payment method defines WHERE it is available.
 * Use getPaymentMethodTypesForCountry() to derive the inverse.
 *
 * This list matches the payment methods enabled in the Stripe dashboard.
 * Apple Pay, Google Pay, and Cartes Bancaires are handled through the
 * 'card' type and do not need separate entries.
 */

// ---------------------------------------------------------------------------
// Region groups
// ---------------------------------------------------------------------------

const SEPA_COUNTRIES = [
  'AD',
  'AT',
  'BE',
  'BG',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MC',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'SM',
  'VA',
] as const;

const REVOLUT_COUNTRIES = [...SEPA_COUNTRIES, 'GB'] as const;

// ---------------------------------------------------------------------------
// Forward mapping: payment method → supported countries
// ---------------------------------------------------------------------------

type Availability = { countries: readonly string[] | 'all' };

const PAYMENT_METHOD_AVAILABILITY: Record<string, Availability> = {
  // ── Global ──────────────────────────────────────────────────────────────
  card: { countries: 'all' },
  link: { countries: 'all' },

  // ── Multi-region ────────────────────────────────────────────────────────
  amazon_pay: { countries: ['DE', 'ES', 'FR', 'GB', 'IT', 'US'] },
  revolut_pay: { countries: REVOLUT_COUNTRIES },
  pay_by_bank: { countries: ['DE', 'FI', 'FR', 'GB', 'IE'] },

  // ── Country-specific (Europe) ───────────────────────────────────────────
  bancontact: { countries: ['BE'] },
  blik: { countries: ['PL'] },
  eps: { countries: ['AT'] },
  ideal: { countries: ['NL'] },
  p24: { countries: ['PL'] },
  twint: { countries: ['CH'] },

  // ── Direct debit ────────────────────────────────────────────────────────
  us_bank_account: { countries: ['US'] },
  bacs_debit: { countries: ['GB'] },
  sepa_debit: { countries: SEPA_COUNTRIES },
};

// ---------------------------------------------------------------------------
// Derived helper: country → payment method types
// ---------------------------------------------------------------------------

export function getPaymentMethodTypesForCountry(countryCode: string): string[] {
  const upper = countryCode.toUpperCase();
  const methods: string[] = [];

  for (const [method, { countries }] of Object.entries(
    PAYMENT_METHOD_AVAILABILITY,
  )) {
    if (countries === 'all' || countries.includes(upper)) {
      methods.push(method);
    }
  }

  // Guarantee at least card is always present
  if (!methods.includes('card')) {
    methods.unshift('card');
  }

  return methods;
}

export { PAYMENT_METHOD_AVAILABILITY, SEPA_COUNTRIES };
