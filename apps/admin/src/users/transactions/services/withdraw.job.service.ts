import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { Job, Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { v4 as uuidv4 } from 'uuid'; // Add uuid for batch ID
import { WithdrawService } from './withdraw.service';
import { adminWithdrawEmail } from 'lib/mail/mail';
import { getWithdrawTemplate } from 'lib/mail/templates/admin';
import { parseAmount } from 'lib/utils/crypto.utils';

interface JobStatus {
    jobId: string;
    address: string;
    type: 'fund' | 'withdraw';
    amount?: bigint | 0; // For fund jobs
    status: 'pending' | 'completed' | 'failed';
    txHash?: string;
    error?: string;
}

@Injectable()
export class WithdrawJobService {

    private jobTracker: Map<string, JobStatus[]> = new Map(); // Track jobs by batch ID
    private jobCount: Map<string, number> = new Map(); // Track total jobs per batch

    constructor(
        @InjectQueue('withdrawals') private withdrawQueue: Queue,
        @Inject(forwardRef(() => WithdrawService)) private readonly withdrawService: WithdrawService
    ) {
        // Set up queue event listeners for job completion
        this.setupQueueListeners();
    }

    private setupQueueListeners() {
        this.withdrawQueue
            .on('completed', async (job, result) => {
                await this.handleJobCompletion(job, result, 'completed');
            })
            .on('failed', async (job, error) => {
                await this.handleJobCompletion(job, error, 'failed');
            });
    }

    private async handleJobCompletion(job: Job, result: any, status: 'completed' | 'failed') {

        const batchId = job.data.batchId; // Custom option to track batch       

        if (!batchId) return;

        const activeJobs = await this.withdrawQueue.getActive();
        const waitingJobs = await this.withdrawQueue.getWaiting();
        const jobs = this.jobTracker.get(batchId.toString()) || [];

        const jobIndex = jobs.findIndex(j => j.jobId === job.id.toString());

        if (jobs.length > 0 && jobIndex >= 0) {
            if (job.name === 'withdraw') {
                jobs[jobIndex].amount = result?.amount || 0;
            }
            jobs[jobIndex].status = status;
            jobs[jobIndex].txHash = result?.txHash || null;
        }

        if (activeJobs.length === 0 && waitingJobs.length === 0 && jobs.length > 0) {
            await this.sendCompletionEmail(batchId);
            // Clean up
            this.jobTracker.delete(batchId);
            this.jobCount.delete(batchId.toString());
        }
    }

    async executeWithdraws() {

        const addresses = await this.withdrawService.getUniqueMerchantWallets();
        const effectiveGasPrice = await this.withdrawService.getEffectiveGasPrice();
        const masterSigner: any = this.withdrawService.getMasterSigner();
        console.log('Master wallet', masterSigner.address);

        const { needs, eligibleAddresses } = await this.withdrawService.checkWallets(addresses, effectiveGasPrice);

        const batchId = uuidv4().toString(); // Unique ID for this batch

        // Initialize job tracker for this batch
        const jobs: JobStatus[] = [];
        this.jobTracker.set(batchId, jobs);

        // // Fund wallets
        for (const [address, amount] of Object.entries(needs)) {
            const job = await this.addFundWalletJob(address, amount, batchId);
            jobs.push({
                jobId: job.id.toString(),
                address,
                type: 'fund',
                amount,
                status: 'pending',
            });
        }

        // // Process withdrawals
        for (const address of eligibleAddresses) {
            const job = await this.addWithdrawalJob(address, batchId);
            jobs.push({
                jobId: job.id.toString(),
                address,
                type: 'withdraw',
                status: 'pending',
            });
        }

        // Store total job count for the batch
        this.jobCount.set(batchId, jobs.length);

        return {
            message: `Withdrawal batch ${batchId} queued ${jobs.length} jobs. You will be notified by email upon completion.`,
            batchId,
            status: 200,
        };
    }

    async addWithdrawalJob(address: string, batchId: string) {
        const job = await this.withdrawQueue.add('withdraw', { address, batchId }, {
            attempts: 5,
            backoff: 5000,
        });
        return job;
    }

    async addFundWalletJob(address: string, amount: bigint, batchId: string) {
        const job = await this.withdrawQueue.add('fund', { address, amount: amount.toString(), batchId }, {
            attempts: 5,
            backoff: 5000
        });
        return job;
    }

    async isJobAlreadyQueued(address: string): Promise<boolean> {
        const waitingJobs = await this.withdrawQueue.getWaiting();
        if (waitingJobs.some(job => job.data.address === address)) {
            return true;
        }
        const activeJobs = await this.withdrawQueue.getActive();
        if (activeJobs.some(job => job.data.address === address)) {
            return true;
        }
        return false;
    }

    private async sendCompletionEmail(batchId: string) {
        const jobs = this.jobTracker.get(batchId.toString()) || [];
        console.log('jobs', jobs);


        const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'; // Configure in .env

        // Categorize jobs
        const successfulFunds = jobs.filter(j => j.type === 'fund' && j.status === 'completed');
        const failedFunds = jobs.filter(j => j.type === 'fund' && j.status === 'failed');
        const successfulWithdrawals = jobs.filter(j => j.type === 'withdraw' && j.status === 'completed');
        const failedWithdrawals = jobs.filter(j => j.type === 'withdraw' && j.status === 'failed');

        // Resume data
        const totalWallets = new Set(jobs.map(j => j.address)).size;

        const totalEth = successfulFunds.reduce((sum, j) => sum + parseAmount(j.amount || 0n), 0n);
        const totalUSDC = successfulWithdrawals.reduce((sum, j) => sum + parseAmount(j.amount || 0n), 0n);

        console.log('totalUSDC', ethers.formatUnits(totalUSDC, 6));
        console.log('totalEth', ethers.formatEther(totalEth));

        // Prepare email content
        const summaryHtml = getWithdrawTemplate(            
            totalWallets,
            totalUSDC,
            totalEth,
            successfulFunds,
            failedFunds,
            successfulWithdrawals,
            failedWithdrawals
        );

        await adminWithdrawEmail('Ken.cmd32@proton.me', summaryHtml)

        try {
            console.log(`[${new Date().toISOString()}] Email sent to ${adminEmail} for batch ${batchId}`);
        } catch (error: any) {
            console.error(`[${new Date().toISOString()}] Failed to send email for batch ${batchId}: ${error.message}`);
        }
    }

    async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}