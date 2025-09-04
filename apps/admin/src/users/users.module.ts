import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserService as AuthService } from 'apps/auth/src/users/users.service';
import { UsersController } from './users.controller';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from 'apps/auth/src/email/token.service';
import { BalancesService } from 'lib/common/services/balances.service';
import { SmsService } from 'apps/auth/src/sms/sms.service';
import { WithdrawService } from './transactions/services/withdraw.service';
import { WithdrawCronService } from './transactions/services/withdraw.cron.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    PrismaService,
    SmsService,
    AuthService,
    TokenService,
    BalancesService,
    WithdrawService,
    WithdrawCronService

  ],
})
export class UsersModule { }
