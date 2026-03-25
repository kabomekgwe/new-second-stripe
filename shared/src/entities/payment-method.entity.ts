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

@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.paymentMethods, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  stripePaymentMethodId: string;

  @Column()
  type: string;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ nullable: true })
  last4: string | null;

  @Column({ nullable: true })
  brand: string | null;

  @Column({ type: 'int', nullable: true })
  expiryMonth: number | null;

  @Column({ type: 'int', nullable: true })
  expiryYear: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
