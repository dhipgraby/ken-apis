import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MtPelerinService } from 'lib/common/transactions/mtpelerin.service';

@Injectable()
export class MtPelerinCronService {
    private readonly logger = new Logger(MtPelerinCronService.name);

    private isEnabled = false;

    constructor(private readonly mtPelerinService: MtPelerinService) { }

    // @Cron('*/5 * * * * *') // Every 5 seconds
    // async handleCron() {
    //     if (!this.isEnabled) {
    //         // this.logger.debug('MtPelerin cron is disabled');
    //         return;
    //     }
    //     this.logger.debug('Running MtPelerin transaction fetch');

    //     // You can define your time range here
    //     const now = new Date();
    //     const fromDate = `${now.getFullYear()}-01-01`;
    //     const toDate = `${now.getFullYear() + 1}-01-01`;
    //     try {
    //         const result = await this.mtPelerinService.fetchMtPelerinTransactions(fromDate, toDate);
    //         this.logger.debug(`Fetched transactions: ${JSON.stringify(result)}`);
    //     } catch (err) {
    //         this.logger.error('Error fetching MtPelerin transactions', err);
    //     }
    // }
}
