import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from 'lib/common/auth/admin-guard';
import { WithdrawService } from '../services/withdraw.service';
import { Prisma } from '@prisma/client';

@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('withdraw')
export class WithdrawController {
    constructor(
        private readonly withdrawService: WithdrawService
    ) { }

    @Get('deposit-wallet')
    async getWallet() {
        const depositWallet: string = process.env.DEPOSIT_WALLET || '';
        return depositWallet;
    }

    @Get('user-wallets')
    async getUserWallets() {
        return this.withdrawService.getUserWallets();
    }

    @Get('withdrawals')
    async getWithdrawals(
        @Query('page') page = 1,
        @Query('limit') limit = 10,
        @Query('startDate') startDate,
        @Query('userId') userId,
        @Query('endDate') endDate,
        @Query('orderBy') orderBy
    ) {

        const filters: Prisma.WithdrawalsWhereInput = {};

        if (startDate || endDate) {
            filters.created_at = {};
            if (startDate) {
                filters.created_at.gte = new Date(startDate).toISOString();
            }
            if (endDate) {
                filters.created_at.lte = new Date(endDate).toISOString();
            }
        }

        if (userId) filters.userId = Number(userId)

        return this.withdrawService.getWithdrawals(
            Number(page),
            Number(limit),
            filters,
            orderBy
        )

    }

    @Post('withdraw')
    async executeWithdraw() {
        return this.withdrawService.singleWithdrawProcess();
    }

    @Post('fund-wallets')
    async fundUserWallets(@Body() body: { addresses: string[], createMock: boolean }) {
        
        return this.withdrawService.fundUserWallets(body.addresses, body.createMock);
    }

}