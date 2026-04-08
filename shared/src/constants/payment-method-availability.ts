export type PaymentMethodAvailabilityCategory =
  | 'Card'
  | 'Bank Redirect'
  | 'Bank debit'
  | 'Bank transfers';

type AvailabilityScope =
  | { mode: 'always' }
  | { mode: 'countries'; countries: string[] }
  | { mode: 'europe' }
  | { mode: 'uk' }
  | { mode: 'uk_and_europe' }
  | { mode: 'rest_of_world' }
  | { mode: 'bank_transfer_markets' };

export type AvailablePaymentMethodDefinition = {
  type: string;
  label: string;
  category: PaymentMethodAvailabilityCategory;
  scope: AvailabilityScope;
};

export const EUROPEAN_COUNTRY_CODES = [
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
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
].sort();

export const BANK_TRANSFER_MARKET_COUNTRY_CODES = [
  ...EUROPEAN_COUNTRY_CODES,
  'GB',
  'JP',
  'MX',
  'US',
].sort();

export const REGION_BASED_PAYMENT_METHODS: AvailablePaymentMethodDefinition[] =
  [
    {
      type: 'card',
      label: 'AMEX - Domestic / EEA',
      category: 'Card',
      scope: { mode: 'uk_and_europe' },
    },
    {
      type: 'card',
      label: 'AMEX - International',
      category: 'Card',
      scope: { mode: 'rest_of_world' },
    },
    {
      type: 'card',
      label: 'Visa / Mastercard - EEA',
      category: 'Card',
      scope: { mode: 'europe' },
    },
    {
      type: 'card',
      label: 'Visa / Mastercard - International',
      category: 'Card',
      scope: { mode: 'rest_of_world' },
    },
    {
      type: 'card',
      label: 'Visa / Mastercard - Premium',
      category: 'Card',
      scope: { mode: 'uk' },
    },
    {
      type: 'card',
      label: 'Visa / Mastercard - Standard',
      category: 'Card',
      scope: { mode: 'uk' },
    },
    {
      type: 'apple_pay',
      label: 'Apple Pay',
      category: 'Card',
      scope: { mode: 'always' },
    },
    {
      type: 'google_pay',
      label: 'Google Pay',
      category: 'Card',
      scope: { mode: 'always' },
    },
    {
      type: 'amazon_pay',
      label: 'Amazon Pay',
      category: 'Card',
      scope: { mode: 'always' },
    },
    {
      type: 'link',
      label: 'Link',
      category: 'Card',
      scope: { mode: 'always' },
    },
    {
      type: 'bancontact',
      label: 'Bancontact',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['BE'] },
    },
    {
      type: 'eps',
      label: 'EPS',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['AT'] },
    },
    {
      type: 'ideal',
      label: 'iDEAL',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['NL'] },
    },
    {
      type: 'pay_by_bank',
      label: 'Pay By Bank',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['GB'] },
    },
    {
      type: 'p24',
      label: 'Przelewy24',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['PL'] },
    },
    {
      type: 'sofort',
      label: 'Sofort',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['AT', 'CH', 'DE'] },
    },
    {
      type: 'twint',
      label: 'TWINT',
      category: 'Bank Redirect',
      scope: { mode: 'countries', countries: ['CH'] },
    },
    {
      type: 'us_bank_account',
      label: 'ACH Direct Debit',
      category: 'Bank debit',
      scope: { mode: 'countries', countries: ['US'] },
    },
    {
      type: 'bacs_debit',
      label: 'Bacs Direct Debit',
      category: 'Bank debit',
      scope: { mode: 'uk' },
    },
    {
      type: 'sepa_debit',
      label: 'SEPA Direct Debit',
      category: 'Bank debit',
      scope: { mode: 'europe' },
    },
    {
      type: 'customer_balance',
      label: 'GBP Bank transfer',
      category: 'Bank transfers',
      scope: { mode: 'bank_transfer_markets' },
    },
    {
      type: 'customer_balance',
      label: 'USD Bank transfer',
      category: 'Bank transfers',
      scope: { mode: 'bank_transfer_markets' },
    },
    {
      type: 'customer_balance',
      label: 'EURO Bank transfer',
      category: 'Bank transfers',
      scope: { mode: 'bank_transfer_markets' },
    },
  ];

export function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

export function isEuropeanCountry(countryCode: string): boolean {
  return EUROPEAN_COUNTRY_CODES.includes(normalizeCountryCode(countryCode));
}

function isAvailableForCountry(
  scope: AvailabilityScope,
  countryCode: string,
): boolean {
  const normalizedCountryCode = normalizeCountryCode(countryCode);

  switch (scope.mode) {
    case 'always':
      return true;
    case 'countries':
      return scope.countries.includes(normalizedCountryCode);
    case 'europe':
      return isEuropeanCountry(normalizedCountryCode);
    case 'uk':
      return normalizedCountryCode === 'GB';
    case 'uk_and_europe':
      return normalizedCountryCode === 'GB' || isEuropeanCountry(normalizedCountryCode);
    case 'rest_of_world':
      return (
        normalizedCountryCode !== 'GB' &&
        !isEuropeanCountry(normalizedCountryCode)
      );
    case 'bank_transfer_markets':
      return BANK_TRANSFER_MARKET_COUNTRY_CODES.includes(normalizedCountryCode);
    default:
      return false;
  }
}

export function getAvailablePaymentMethodDefinitionsForCountry(
  countryCode: string,
): AvailablePaymentMethodDefinition[] {
  return REGION_BASED_PAYMENT_METHODS.filter((entry) =>
    isAvailableForCountry(entry.scope, countryCode),
  );
}

/**
 * Types that can't be used with Stripe SetupIntents.
 * Wallets (apple_pay, google_pay) are handled via 'card'.
 * customer_balance is for invoices/bank transfers, not setup intents.
 */
const SETUP_INTENT_EXCLUDED_TYPES = new Set([
  'apple_pay',
  'google_pay',
  'customer_balance',
]);

/**
 * Returns the unique Stripe payment_method_types to pass when creating a
 * SetupIntent for the given country. Filters out wallet and invoice-only types.
 */
export function getStripeSetupIntentTypesForCountry(
  countryCode: string,
): string[] {
  const defs = getAvailablePaymentMethodDefinitionsForCountry(countryCode);
  const types = new Set<string>();
  for (const def of defs) {
    if (!SETUP_INTENT_EXCLUDED_TYPES.has(def.type)) {
      types.add(def.type);
    }
  }
  return [...types];
}

export function isPaymentMethodTypeAvailableForCountry(
  paymentMethodType: string,
  countryCode: string,
): boolean {
  const matchingEntries = REGION_BASED_PAYMENT_METHODS.filter(
    (entry) => entry.type === paymentMethodType,
  );

  if (matchingEntries.length === 0) {
    return paymentMethodType === 'card';
  }

  return matchingEntries.some((entry) =>
    isAvailableForCountry(entry.scope, countryCode),
  );
}
