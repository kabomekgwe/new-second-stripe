import { ConflictException, Injectable } from '@nestjs/common';
import { User, getCurrencyForCountry } from '@stripe-app/shared';
import type { DbConnection } from '../database/oracle.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OracleService } from '../database/oracle.service';
import { mapUser } from '../database/sql-mappers';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersSqlService {
  constructor(private readonly database: OracleService) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.database.query(
      'SELECT * FROM users WHERE id = :1 FETCH FIRST 1 ROWS ONLY',
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.database.query(
      'SELECT * FROM users WHERE email = :1 FETCH FIRST 1 ROWS ONLY',
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const currency = getCurrencyForCountry(dto.country);

    const userId = randomUUID();
    await this.database.query(
      `INSERT INTO users (
        id,
        email,
        password,
        name,
        country,
        currency
      ) VALUES (:1, :2, :3, :4, :5, :6)`,
      [userId, dto.email, hashedPassword, dto.name, dto.country, currency],
    );

    const result = await this.database.query(
      'SELECT * FROM users WHERE id = :1',
      [userId],
    );
    return mapUser(result.rows[0]);
  }

  async updateStripeCustomerId(
    userId: string,
    customerId: string,
  ): Promise<void> {
    await this.database.query(
      'UPDATE users SET "stripeCustomerId" = :2, "updatedAt" = SYSTIMESTAMP WHERE id = :1',
      [userId, customerId],
    );
  }

  async deleteById(userId: string): Promise<void> {
    await this.database.query('DELETE FROM users WHERE id = :1', [userId]);
  }

  async updateDefaultPaymentMethod(
    userId: string,
    paymentMethodId: string | null,
  ): Promise<void> {
    await this.database.query(
      'UPDATE users SET "defaultPaymentMethodId" = :2, "updatedAt" = SYSTIMESTAMP WHERE id = :1',
      [userId, paymentMethodId],
    );
  }

  async updateStripeCustomerAndReturn(
    userId: string,
    customerId: string,
  ): Promise<User | null> {
    await this.updateStripeCustomerId(userId, customerId);
    return this.findById(userId);
  }
}
