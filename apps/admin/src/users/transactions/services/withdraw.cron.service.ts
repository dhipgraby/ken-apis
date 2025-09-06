import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WithdrawService } from './withdraw.service';

@Injectable()
export class WithdrawCronService {
    private readonly logger = new Logger(WithdrawCronService.name);

    private isEnabled = false;

    constructor(
        private readonly withdrawService: WithdrawService,
    ) { }

    // Run withdraw 5 minutes after deposit in a 20-minute repeating cycle: minutes 5,25,45
    @Cron('0 5/20 * * * *') 
    async handleCron() {
        if (!this.isEnabled) {
            this.logger.debug('Withdraw cron is disabled');
            return;
        }
        this.logger.debug('Running withdraw cron job!');
        try {
            const result = await this.withdrawService.singleWithdrawProcess();
            this.logger.debug(`Calling execute withdraw: ${JSON.stringify(result)}`);
        } catch (err) {
            this.logger.error('Error executing withdraw', err);
        }
    }

    // Run deposit at the start of the 20-minute cycle: minutes 0,20,40
    @Cron('0 0/20 * * * *')
    async handleDepositCron() {
        if (!this.isEnabled) {
            this.logger.debug('MtPelerin deposit cron is disabled');
            return;
        }
        this.logger.debug('Running MtPelerin transaction fetch');

        // You can define your time range here
        const now = new Date();
        const fromDate = `${now.getFullYear()}-01-01`;
        const toDate = `${now.getFullYear() + 1}-01-01`;
        try {
            this.logger.debug(`Fetched transactions`);
        } catch (err) {
            this.logger.error('Error fetching MtPelerin transactions', err);
        }
    }
}
