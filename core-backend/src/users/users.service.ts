import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, getCurrencyForCountry } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { CreateUserDto } from './dto/create-user.dto';
import { generateIdempotencyKey } from '../common/utils/idempotency';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private stripeService: StripeService,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const currency = getCurrencyForCountry(dto.country);

    const user = this.usersRepository.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      country: dto.country,
      currency,
    });

    const savedUser = await this.usersRepository.save(user);

    const stripeCustomer = await this.stripeService.createCustomer(
      {
        email: dto.email,
        name: dto.name,
        metadata: { userId: savedUser.id },
      },
      generateIdempotencyKey('create_customer', savedUser.id),
    );

    savedUser.stripeCustomerId = stripeCustomer.id;
    return this.usersRepository.save(savedUser);
  }

  async updateStripeCustomerId(
    userId: string,
    customerId: string,
  ): Promise<void> {
    await this.usersRepository.update(userId, {
      stripeCustomerId: customerId,
    });
  }
}
