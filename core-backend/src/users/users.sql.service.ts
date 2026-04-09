import { ConflictException, Injectable } from '@nestjs/common';
import { User, getCurrencyForCountry } from '../shared';
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
      'SELECT * FROM USERS WHERE ID = :1 FETCH FIRST 1 ROWS ONLY',
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.database.query(
      'SELECT * FROM USERS WHERE EMAIL = :1 FETCH FIRST 1 ROWS ONLY',
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
      `INSERT INTO USERS (
        ID,
        EMAIL,
        PASSWORD,
        USER_NAME,
        COUNTRY,
        CURRENCY
      ) VALUES (:1, :2, :3, :4, :5, :6)`,
      [userId, dto.email, hashedPassword, dto.name, dto.country, currency],
    );

    const result = await this.database.query(
      'SELECT * FROM USERS WHERE ID = :1',
      [userId],
    );
    return mapUser(result.rows[0]);
  }

  async updateStripeCustomerId(
    userId: string,
    customerId: string,
  ): Promise<void> {
    await this.database.query(
      'UPDATE USERS SET STRIPE_CUSTOMER_ID = :1, UPDATED_AT = SYSTIMESTAMP WHERE ID = :2',
      [customerId, userId],
    );
  }

  async deleteById(userId: string): Promise<void> {
    await this.database.query('DELETE FROM USERS WHERE ID = :1', [userId]);
  }

  async updateCountry(
    userId: string,
    country: string,
  ): Promise<User | null> {
    const currency = getCurrencyForCountry(country);
    await this.database.query(
      'UPDATE USERS SET COUNTRY = :1, CURRENCY = :2, UPDATED_AT = SYSTIMESTAMP WHERE ID = :3',
      [country, currency, userId],
    );
    return this.findById(userId);
  }

  async updateDefaultPaymentMethod(
    userId: string,
    paymentMethodId: string | null,
  ): Promise<void> {
    await this.database.query(
      'UPDATE USERS SET DEFAULT_PAYMENT_METHOD_ID = :1, UPDATED_AT = SYSTIMESTAMP WHERE ID = :2',
      [paymentMethodId, userId],
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
