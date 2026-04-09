import { Injectable } from '@nestjs/common';
import { User } from '../shared';
import { StripeCustomersService } from '../stripe/stripe-customers.service';
import { CreateUserDto } from './dto/create-user.dto';
import { generateIdempotencyKey } from '../common/utils/idempotency';
import { UsersSqlService } from './users.sql.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersSqlService: UsersSqlService,
    private readonly stripeCustomers: StripeCustomersService,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersSqlService.findById(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersSqlService.findByEmail(email);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user = await this.usersSqlService.create(dto);

    try {
      const stripeCustomer = await this.stripeCustomers.createCustomer(
        {
          email: dto.email,
          name: dto.name,
          metadata: { userId: user.id },
          address: { country: dto.country },
        },
        generateIdempotencyKey('create_customer', user.id),
      );

      const updatedUser = await this.usersSqlService.updateStripeCustomerAndReturn(
        user.id,
        stripeCustomer.id,
      );

      return updatedUser ?? user;
    } catch (error) {
      await this.usersSqlService.deleteById(user.id);
      throw error;
    }
  }

  async updateCountry(userId: string, country: string): Promise<User | null> {
    const user = await this.usersSqlService.updateCountry(userId, country);
    if (user?.stripeCustomerId) {
      await this.stripeCustomers.updateCustomer(user.stripeCustomerId, {
        address: { country },
      });
    }
    return user;
  }

  async updateStripeCustomerId(
    userId: string,
    customerId: string,
  ): Promise<void> {
    await this.usersSqlService.updateStripeCustomerId(userId, customerId);
  }
}
