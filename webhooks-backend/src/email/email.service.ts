import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface InvoiceEmailParams {
  to: string;
  userName: string;
  amountPence: number;
  description: string;
  periodStart: Date;
  periodEnd: Date;
  chargeId: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'billing@yourdomain.com';
  }

  async sendInvoiceEmail(params: InvoiceEmailParams): Promise<void> {
    // If Resend is not configured, log and return early
    if (!this.resend) {
      this.logger.warn(
        `Resend not configured - skipping email for charge ${params.chargeId}`,
      );
      return;
    }

    const amount = (params.amountPence / 100).toFixed(2);
    const periodStart = this.formatDate(params.periodStart);
    const periodEnd = this.formatDate(params.periodEnd);
    const invoiceDate = this.formatDate(new Date());

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: params.to,
        subject: `Invoice – ${params.description}`,
        html: this.buildInvoiceHtml({
          userName: params.userName,
          amount,
          description: params.description,
          periodStart,
          periodEnd,
          invoiceDate,
          chargeId: params.chargeId,
        }),
      });

      this.logger.log(
        `Invoice email sent to ${params.to} for charge ${params.chargeId}`,
      );
    } catch (error) {
      // Log but do NOT throw — prevent webhook retry loops
      this.logger.error(
        `Failed to send invoice email to ${params.to} for charge ${params.chargeId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  private buildInvoiceHtml(params: {
    userName: string;
    amount: string;
    description: string;
    periodStart: string;
    periodEnd: string;
    invoiceDate: string;
    chargeId: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Invoice</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Hi ${params.userName},
              </p>
              <p style="margin:0 0 32px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Your payment has been successfully processed. Here are the details:
              </p>
              <!-- Invoice Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
                <tr style="background-color:#fafafa;">
                  <td style="padding:12px 16px;color:#71717a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Description</td>
                  <td style="padding:12px 16px;color:#71717a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;" align="right">Amount</td>
                </tr>
                <tr>
                  <td style="padding:16px;color:#18181b;font-size:15px;border-top:1px solid #e4e4e7;">${params.description}</td>
                  <td style="padding:16px;color:#18181b;font-size:15px;border-top:1px solid #e4e4e7;font-weight:600;" align="right">&pound;${params.amount}</td>
                </tr>
                <tr style="background-color:#fafafa;">
                  <td style="padding:16px;color:#18181b;font-size:16px;font-weight:700;border-top:2px solid #e4e4e7;">Total</td>
                  <td style="padding:16px;color:#18181b;font-size:16px;font-weight:700;border-top:2px solid #e4e4e7;" align="right">&pound;${params.amount}</td>
                </tr>
              </table>
              <!-- Metadata -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="padding:6px 0;color:#71717a;font-size:13px;">Billing period</td>
                  <td style="padding:6px 0;color:#3f3f46;font-size:13px;" align="right">${params.periodStart} – ${params.periodEnd}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#71717a;font-size:13px;">Invoice date</td>
                  <td style="padding:6px 0;color:#3f3f46;font-size:13px;" align="right">${params.invoiceDate}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#71717a;font-size:13px;">Reference</td>
                  <td style="padding:6px 0;color:#3f3f46;font-size:13px;" align="right">${params.chargeId}</td>
                </tr>
              </table>
              <!-- Footer note -->
              <p style="margin:32px 0 0;color:#a1a1aa;font-size:13px;line-height:1.6;">
                This payment was charged to your default payment method on file. If you have any questions, please contact support.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }
}
