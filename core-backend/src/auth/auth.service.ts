import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '../shared';
import { UsersService } from '../users/users.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private paymentMethodsService: PaymentMethodsService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;

    const { password: _, ...result } = user;
    return result;
  }

  async register(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.create(dto);
    const { password: _, ...result } = user;
    return result;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<User, 'password'>> {
    if (dto.country) {
      await this.paymentMethodsService.cancelActiveSetupIntents(userId);
      const user = await this.usersService.updateCountry(userId, dto.country);
      if (!user) throw new NotFoundException('User not found');
      const { password: _, ...result } = user;
      return result;
    }
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const { password: _, ...result } = user;
    return result;
  }
}
