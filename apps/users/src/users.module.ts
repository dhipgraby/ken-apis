import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { PrismaService } from 'lib/common/database/prisma.service';
import { UserService as AuthService } from 'apps/auth/src/users/users.service';
import { TokenService } from 'apps/auth/src/email/token.service';
import { TransactionsModule } from './transactions/transactions.module';
import { DepositsController } from './transactions/controllers/deposits.controller';
import { DepositsService } from 'lib/common/transactions/deposits.service';
import { BalancesService } from 'lib/common/services/balances.service';
import { SmsService } from './services/sms.service';
import { SmsService as UserSmsService } from 'apps/auth/src/sms/sms.service';

@Module({
  controllers: [UsersController, DepositsController],
  providers: [
    UsersService,
    PrismaService,
    AuthService,
    UserSmsService,
    SmsService,
    TokenService,
    DepositsService,
    BalancesService
  // JwtService is automatically provided by JwtModule
  ], 
  imports: [
  TransactionsModule,
  JwtModule.register({}) // Add your config here if needed
  ],
})
export class UsersModule { }
