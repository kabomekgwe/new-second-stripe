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
import { BillingSubscriptionStatus } from '../types/stripe.types';

@Entity('billing_subscriptions')
export class BillingSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.billingSubscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', unique: true })
  stripeSubscriptionId: string;

  @Column({ type: 'varchar' })
  stripeSubscriptionItemId: string;

  @Column({ type: 'varchar' })
  stripePriceId: string;

  @Column({
    type: 'enum',
    enum: BillingSubscriptionStatus,
    default: BillingSubscriptionStatus.INCOMPLETE,
  })
  status: BillingSubscriptionStatus;

  @Column({ type: 'date', nullable: true })
  currentPeriodStart: Date | null;

  @Column({ type: 'date', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'timestamp', nullable: true })
  canceledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
