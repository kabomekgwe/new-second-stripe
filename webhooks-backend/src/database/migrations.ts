export type SqlMigration = {
  id: string;
  sql: string;
};

export const SQL_MIGRATIONS: SqlMigration[] = [
  {
    id: '001_raw_sql_baseline',
    sql: `
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar NOT NULL UNIQUE,
        password varchar NOT NULL,
        name varchar NOT NULL,
        country varchar(2) NOT NULL,
        currency varchar(3) NOT NULL,
        "stripeCustomerId" varchar UNIQUE,
        "defaultPaymentMethodId" varchar,
        "monthlyManagementFee" numeric(12, 0),
        "accountValue" numeric(18, 2),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS users_stripe_customer_id_idx
        ON users ("stripeCustomerId");

      CREATE TABLE IF NOT EXISTS payment_methods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "stripePaymentMethodId" varchar NOT NULL UNIQUE,
        type varchar NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        last4 varchar(4),
        brand varchar,
        "expiryMonth" integer,
        "expiryYear" integer,
        metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS payment_methods_user_id_idx
        ON payment_methods ("userId");

      CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "stripePaymentIntentId" varchar UNIQUE,
        "stripeCheckoutSessionId" varchar UNIQUE,
        "amountGbp" integer NOT NULL,
        "amountUserCurrency" integer,
        "userCurrency" varchar(3),
        "fxQuoteId" varchar,
        status varchar NOT NULL DEFAULT 'pending',
        "paymentMethodId" varchar,
        "idempotencyKey" varchar NOT NULL UNIQUE,
        metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS payments_user_id_idx
        ON payments ("userId");

      CREATE TABLE IF NOT EXISTS usage_charges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "stripeInvoiceId" varchar,
        "stripeSubscriptionId" varchar,
        "stripeSubscriptionItemId" varchar,
        "stripePaymentIntentId" varchar,
        "amountGbp" integer NOT NULL,
        description varchar,
        "billingPeriodStart" date NOT NULL,
        "billingPeriodEnd" date NOT NULL,
        status varchar NOT NULL DEFAULT 'pending',
        "idempotencyKey" varchar NOT NULL UNIQUE,
        "usageReportedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS usage_charges_user_id_idx
        ON usage_charges ("userId");

      -- Add missing columns before creating index (idempotent)
      ALTER TABLE usage_charges
        ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" varchar;
      ALTER TABLE usage_charges
        ADD COLUMN IF NOT EXISTS "stripeSubscriptionItemId" varchar;
      ALTER TABLE usage_charges
        ADD COLUMN IF NOT EXISTS "stripeInvoiceId" varchar;
      ALTER TABLE usage_charges
        ADD COLUMN IF NOT EXISTS "usageReportedAt" timestamptz;

      -- Create index after columns are guaranteed to exist
      CREATE INDEX IF NOT EXISTS usage_charges_subscription_idx
        ON usage_charges ("stripeSubscriptionId", "stripeSubscriptionItemId");

      CREATE TABLE IF NOT EXISTS billing_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "stripeSubscriptionId" varchar NOT NULL UNIQUE,
        "stripeSubscriptionItemId" varchar NOT NULL,
        "stripePriceId" varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'incomplete',
        "currentPeriodStart" date,
        "currentPeriodEnd" date,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "canceledAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS billing_subscriptions_user_id_idx
        ON billing_subscriptions ("userId");

      CREATE TABLE IF NOT EXISTS webhook_events (
        "eventId" varchar PRIMARY KEY,
        type varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'processing',
        "processedAt" timestamptz,
        "lastError" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
];
