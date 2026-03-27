import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WebhookEventStatus } from '../types/stripe.types';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryColumn({ type: 'varchar' })
  eventId: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({
    type: 'enum',
    enum: WebhookEventStatus,
    default: WebhookEventStatus.PROCESSING,
  })
  status: WebhookEventStatus;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
