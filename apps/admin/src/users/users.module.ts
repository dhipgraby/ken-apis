import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from '../email/token.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, TokenService],
})
export class UsersModule {}
