import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { UsersService } from '../users/users.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private usersService: UsersService) {
    super();
  }

  serializeUser(user: any, done: (err: any, id?: string) => void) {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (err: any, user?: any) => void) {
    try {
      const user = await this.usersService.findById(id);
      if (user) {
        const { password: _, ...safeUser } = user;
        done(null, safeUser);
      } else {
        done(null, undefined);
      }
    } catch (err) {
      done(err);
    }
  }
}
