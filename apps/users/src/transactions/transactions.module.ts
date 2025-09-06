import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DepositsController } from './controllers/deposits.controller';
import { DepositsService } from 'lib/common/transactions/deposits.service';
import { PrismaService } from 'lib/common/database/prisma.service';
import { BalancesService } from 'lib/common/services/balances.service';
import { SmsService } from '../services/sms.service';

@Module({
  controllers: [
    DepositsController,
  ],
  providers: [
    DepositsService,
    PrismaService,
    BalancesService,
    SmsService
  ],
  imports: [
    JwtModule.register({}) // Add your config here if needed
  ]
})
export class TransactionsModule { }
