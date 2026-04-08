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
import { PaymentStatus } from '../types/stripe.types';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', unique: true, nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  stripeCheckoutSessionId: string | null;

  @Column({ type: 'int' })
  amountGbp: number;

  @Column({ type: 'int', nullable: true })
  amountUserCurrency: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  userCurrency: string | null;

  @Column({ type: 'varchar', nullable: true })
  fxQuoteId: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  paymentMethodId: string | null;

  @Column({ unique: true })
  idempotencyKey: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
