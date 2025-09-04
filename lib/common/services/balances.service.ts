import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DepositStatus } from '../types/deposit.types';

@Injectable()
export class BalancesService {
    constructor(private readonly prisma: PrismaService) { }

    async getBalance(userId: number) {
        const balance = await this.prisma.balances.findUnique({ where: { userId } });
        if (!balance) {
            throw new HttpException('User balance profile not found', HttpStatus.NOT_FOUND);
        }
        return balance;
    }

    async getUserBalance(userId: number) {
        const balance = await this.prisma.balances.findUnique({ where: { userId }, select: { daiColateral: true, eur: true } });
        if (!balance) return {
            daiColateral: 0,
            eur: 0,
            isCreated: false
        }

        balance["isCreated"] = true
        return balance;
    }

    async increaseBalance(userId: number, eurAmount: number) {
        const balance = await this.getBalance(userId);
        const newEurBalance = Number(balance.eur) + Number(eurAmount);

        await this.prisma.balances.update({
            where: { userId },
            data: {
                eur: newEurBalance,
                last_modified: new Date().toISOString(),
            },
        });
    }

    async decreaseBalance(userId: number, eurAmount: number) {
        const balance = await this.getBalance(userId);
        const newEurBalance = Number(balance.eur) - Number(eurAmount);

        if (newEurBalance < 0) {
            throw new HttpException('Insufficient balance', HttpStatus.BAD_REQUEST);
        }

        await this.prisma.balances.update({
            where: { userId },
            data: {
                eur: newEurBalance,
                last_modified: new Date().toISOString(),
            },
        });
    }

    async verifyBalance(userId: number) {
        const deposits = await this.prisma.deposits.findMany({
            where: { userId, depositStatus: DepositStatus.SUCCESS },
        });
        const totalDeposits = deposits.reduce((acc, deposit) => acc + deposit.eurAmount, 0);

        const balance = await this.getBalance(userId);

        if (totalDeposits !== balance.eur) {
            throw new HttpException('Balance verification failed', HttpStatus.CONFLICT);
        }

        return true;
    }
}
