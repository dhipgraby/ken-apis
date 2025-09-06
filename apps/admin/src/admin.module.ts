import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from 'lib/common/auth/jwt.strategy';
import { AdminController } from './admin.controller';
import { UsersController } from './users/users.controller';
import { DepositsController } from './users/transactions/controllers/deposit.controller';
import { DepositsService } from 'lib/common/transactions/deposits.service';
import { UserService } from 'apps/auth/src/users/users.service';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from 'apps/auth/src/email/token.service';
import { AdminService } from './admin.service';
import { UsersModule } from './users/users.module';
import { UsersService as internalUsersService } from './users/users.service';
import { BalancesService } from 'lib/common/services/balances.service';
import { SmsService } from 'apps/auth/src/sms/sms.service';
import { ScheduleModule } from '@nestjs/schedule';
import { WithdrawController } from './users/transactions/controllers/withdraw.controller';
import { WithdrawService } from './users/transactions/services/withdraw.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_KEY,
      signOptions: { expiresIn: '20h' },
    }),
    UsersModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AdminController,
    UsersController,
    DepositsController,
    WithdrawController
  ],
  providers: [
    AdminService,
    PrismaService,
    JwtStrategy,
    UserService,
    SmsService,
    TokenService,
    internalUsersService,
    DepositsService,
    BalancesService,
    WithdrawService
  ],
})
export class AdminModule { }
