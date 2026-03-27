import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersSqlService } from './users.sql.service';

@Module({
  providers: [UsersService, UsersSqlService],
  exports: [UsersService],
})
export class UsersModule {}
