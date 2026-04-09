import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(LocalAuthGuard)
  login(@Req() req: Request) {
    return req.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedGuard)
  async logout(@Req() req: Request) {
    await new Promise<void>((resolve, reject) => {
      req.logout((err) => (err ? reject(err) : resolve()));
    });
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  me(@Req() req: Request) {
    return req.user;
  }

  @Patch('profile')
  @UseGuards(AuthenticatedGuard)
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const user = req.user as { id: string };
    return this.authService.updateProfile(user.id, dto);
  }
}
