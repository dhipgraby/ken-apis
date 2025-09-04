import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from './token.service';
import { UserService } from '../users/users.service';
import { SmsService } from '../sms/sms.service';

@Module({
  controllers: [],
  providers: [EmailService, UserService, PrismaService, TokenService, SmsService],
})
export class EmailModule { }
