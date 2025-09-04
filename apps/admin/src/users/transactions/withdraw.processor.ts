import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { WithdrawService } from './services/withdraw.service';
import { ethers } from 'ethers';

@Processor('withdrawals')
export class WithdrawProcessor {
    constructor(private readonly withdrawService: WithdrawService) { }

    @Process('fund')
    async handleFundWallet(job: Job<{ address: string; amount: string }>) {
        const { address } = job.data;
        const amount = BigInt(job.data.amount);
        console.log(`[${new Date().toISOString()}] Processing fund job ${job.id} for ${address} with ${ethers.formatEther(amount)} ETH`);
        try {
            const result = await this.withdrawService.fundSingleWallet(address, amount);
            console.log('Fund job completed:', job.id, result);

            return result; // Includes txHash
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Fund job ${job.id} failed for ${address}: ${error.message}`);
            throw error;
        }
    }

    @Process('withdraw')
    async handleWithdraw(job: Job<{ address: string }>) {
        const { address } = job.data;
        console.log(`[${new Date().toISOString()}] Processing withdraw job ${job.id} for ${address}`);
        try {
            const result = await this.withdrawService.withdrawFromWallet(address);
            console.log('Withdraw job completed:', job.id, result);
            return result; // Includes txHash or null
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Withdraw job ${job.id} failed for ${address}: ${error.message}`);
            throw error;
        }
    }
}