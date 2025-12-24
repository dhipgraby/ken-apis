import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from './token.service';
import { UserService } from '../users/users.service';

@Module({
  controllers: [],
  providers: [EmailService, UserService, PrismaService, TokenService],
})
export class EmailModule {}
