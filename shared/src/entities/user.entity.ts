import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { PaymentMethod } from './payment-method.entity';
import { Payment } from './payment.entity';
import { UsageCharge } from './usage-charge.entity';

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

  @Column({ nullable: true, unique: true })
  stripeCustomerId: string | null;

  @Column({ nullable: true })
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
