export type SqlMigration = {
  id: string;
  sql: string;
};

export const SQL_MIGRATIONS: SqlMigration[] = [
  {
    id: '001_raw_sql_core_schema',
    sql: `
      BEGIN
        -- Create users table
        BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE "users" (
              "id" VARCHAR2(36) PRIMARY KEY,
              "email" VARCHAR2(4000) NOT NULL UNIQUE,
              "password" VARCHAR2(4000) NOT NULL,
              "name" VARCHAR2(4000) NOT NULL,
              "country" VARCHAR2(2) NOT NULL,
              "currency" VARCHAR2(3) NOT NULL,
              "stripeCustomerId" VARCHAR2(4000) UNIQUE,
              "defaultPaymentMethodId" VARCHAR2(4000),
              "monthlyManagementFee" NUMBER(12, 0),
              "accountValue" NUMBER(18, 2),
              "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
              "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
            )
          ';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create users_stripe_customer_id_idx index
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "users_stripe_customer_id_idx" ON "users" ("stripeCustomerId")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create payment_methods table
        BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE "payment_methods" (
              "id" VARCHAR2(36) PRIMARY KEY,
              "userId" VARCHAR2(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
              "stripePaymentMethodId" VARCHAR2(4000) NOT NULL UNIQUE,
              "type" VARCHAR2(4000) NOT NULL,
              "isDefault" NUMBER(1) DEFAULT 0 NOT NULL,
              "last4" VARCHAR2(4),
              "brand" VARCHAR2(4000),
              "expiryMonth" NUMBER(10),
              "expiryYear" NUMBER(10),
              "metadata" CLOB,
              "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
              "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
            )
          ';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create payment_methods_user_id_idx index
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods" ("userId")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create payments table
        BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE "payments" (
              "id" VARCHAR2(36) PRIMARY KEY,
              "userId" VARCHAR2(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
              "stripePaymentIntentId" VARCHAR2(4000) UNIQUE,
              "stripeCheckoutSessionId" VARCHAR2(4000) UNIQUE,
              "amountGbp" NUMBER(10) NOT NULL,
              "amountUserCurrency" NUMBER(10),
              "userCurrency" VARCHAR2(3),
              "fxQuoteId" VARCHAR2(4000),
              "status" VARCHAR2(4000) DEFAULT ''pending'' NOT NULL,
              "paymentMethodId" VARCHAR2(4000),
              "idempotencyKey" VARCHAR2(4000) NOT NULL UNIQUE,
              "metadata" CLOB,
              "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
              "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
            )
          ';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create payments_user_id_idx index
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "payments_user_id_idx" ON "payments" ("userId")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create usage_charges table
        BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE "usage_charges" (
              "id" VARCHAR2(36) PRIMARY KEY,
              "userId" VARCHAR2(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
              "stripeInvoiceId" VARCHAR2(4000),
              "stripeSubscriptionId" VARCHAR2(4000),
              "stripeSubscriptionItemId" VARCHAR2(4000),
              "stripePaymentIntentId" VARCHAR2(4000),
              "amountGbp" NUMBER(10) NOT NULL,
              "description" VARCHAR2(4000),
              "billingPeriodStart" DATE NOT NULL,
              "billingPeriodEnd" DATE NOT NULL,
              "status" VARCHAR2(4000) DEFAULT ''pending'' NOT NULL,
              "idempotencyKey" VARCHAR2(4000) NOT NULL UNIQUE,
              "usageReportedAt" TIMESTAMP WITH TIME ZONE,
              "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
              "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
            )
          ';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create usage_charges_user_id_idx index
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "usage_charges_user_id_idx" ON "usage_charges" ("userId")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create usage_charges_period_idx index
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "usage_charges_period_idx" ON "usage_charges" ("billingPeriodStart", "billingPeriodEnd")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Add stripeSubscriptionId column if not exists
        DECLARE
          v_count NUMBER;
        BEGIN
          SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
          WHERE TABLE_NAME = 'usage_charges' AND COLUMN_NAME = 'stripeSubscriptionId';
          IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE "usage_charges" ADD "stripeSubscriptionId" VARCHAR2(4000)';
          END IF;
        END;

        -- Add stripeSubscriptionItemId column if not exists
        DECLARE
          v_count NUMBER;
        BEGIN
          SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
          WHERE TABLE_NAME = 'usage_charges' AND COLUMN_NAME = 'stripeSubscriptionItemId';
          IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE "usage_charges" ADD "stripeSubscriptionItemId" VARCHAR2(4000)';
          END IF;
        END;

        -- Add stripeInvoiceId column if not exists
        DECLARE
          v_count NUMBER;
        BEGIN
          SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
          WHERE TABLE_NAME = 'usage_charges' AND COLUMN_NAME = 'stripeInvoiceId';
          IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE "usage_charges" ADD "stripeInvoiceId" VARCHAR2(4000)';
          END IF;
        END;

        -- Add usageReportedAt column if not exists
        DECLARE
          v_count NUMBER;
        BEGIN
          SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
          WHERE TABLE_NAME = 'usage_charges' AND COLUMN_NAME = 'usageReportedAt';
          IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE "usage_charges" ADD "usageReportedAt" TIMESTAMP WITH TIME ZONE';
          END IF;
        END;

        -- Create usage_charges_subscription_idx index (after columns guaranteed to exist)
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "usage_charges_subscription_idx" ON "usage_charges" ("stripeSubscriptionId", "stripeSubscriptionItemId")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create billing_subscriptions table
        BEGIN
          EXECUTE IMMEDIATE '
            CREATE TABLE "billing_subscriptions" (
              "id" VARCHAR2(36) PRIMARY KEY,
              "userId" VARCHAR2(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
              "stripeSubscriptionId" VARCHAR2(4000) NOT NULL UNIQUE,
              "stripeSubscriptionItemId" VARCHAR2(4000) NOT NULL,
              "stripePriceId" VARCHAR2(4000) NOT NULL,
              "status" VARCHAR2(4000) DEFAULT ''incomplete'' NOT NULL,
              "currentPeriodStart" DATE,
              "currentPeriodEnd" DATE,
              "cancelAtPeriodEnd" NUMBER(1) DEFAULT 0 NOT NULL,
              "canceledAt" TIMESTAMP WITH TIME ZONE,
              "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
              "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
            )
          ';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;

        -- Create billing_subscriptions_user_id_idx index
        BEGIN
          EXECUTE IMMEDIATE 'CREATE INDEX "billing_subscriptions_user_id_idx" ON "billing_subscriptions" ("userId")';
        EXCEPTION
          WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
        END;
      END;
    `,
  },
  {
    id: '002_add_email_sent_at_to_usage_charges',
    sql: `
      DECLARE
        v_count NUMBER;
      BEGIN
        SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
        WHERE TABLE_NAME = 'usage_charges' AND COLUMN_NAME = 'emailSentAt';
        IF v_count = 0 THEN
          EXECUTE IMMEDIATE 'ALTER TABLE "usage_charges" ADD "emailSentAt" TIMESTAMP WITH TIME ZONE';
        END IF;
      END;
    `,
  },
];
