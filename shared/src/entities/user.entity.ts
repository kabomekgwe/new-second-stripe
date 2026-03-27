import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { PaymentMethod } from './payment-method.entity';
import { Payment } from './payment.entity';
import { UsageCharge } from './usage-charge.entity';
import { BillingSubscription } from './billing-subscription.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column()
  name: string;

  @Column({ length: 2 })
  country: string;

  @Column({ length: 3 })
  currency: string;

  @Index()
  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeCustomerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  defaultPaymentMethodId: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 0, nullable: true })
  monthlyManagementFee: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  accountValue: number | null;

  @OneToMany(() => PaymentMethod, (pm) => pm.user)
  paymentMethods: PaymentMethod[];

  @OneToMany(() => Payment, (p) => p.user)
  payments: Payment[];

  @OneToMany(() => UsageCharge, (uc) => uc.user)
  usageCharges: UsageCharge[];

  @OneToMany(() => BillingSubscription, (subscription) => subscription.user)
  billingSubscriptions: BillingSubscription[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
