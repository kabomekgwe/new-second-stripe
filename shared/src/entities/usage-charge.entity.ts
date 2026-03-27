import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ChargeStatus } from '../types/stripe.types';

@Entity('usage_charges')
export class UsageCharge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.usageCharges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', nullable: true })
  stripeInvoiceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  stripeSubscriptionItemId: string | null;

  @Column({ type: 'varchar', nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'int' })
  amountGbp: number;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'date' })
  billingPeriodStart: Date;

  @Column({ type: 'date' })
  billingPeriodEnd: Date;

  @Column({ type: 'enum', enum: ChargeStatus, default: ChargeStatus.PENDING })
  status: ChargeStatus;

  @Column({ unique: true })
  idempotencyKey: string;

  @Column({ type: 'timestamp', nullable: true })
  usageReportedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
