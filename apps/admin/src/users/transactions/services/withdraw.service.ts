import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { decryptEnvValue, parseAmount } from 'lib/utils/crypto.utils';
import { ethers, formatEther, parseEther } from 'ethers';
import { decryptPrivateKey } from 'utils/crypto';
import { Prisma } from '@prisma/client';
import { getWithdrawTemplate } from 'lib/mail/templates/admin';
import { adminWithdrawEmail } from 'lib/mail/mail';
import { WithdrawStatus } from 'lib/common/dto/transactions/transactions.dto';
import { DepositStatus } from 'lib/common/types/deposit.types';
import { fetchConversionDaiRate } from 'utils/colateral.calculation';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WithdrawService {
    private readonly xpriv: string;
    private readonly provider: ethers.JsonRpcProvider;
    private readonly usdcContract: ethers.Contract;
    private readonly usdcInterface: ethers.Interface;
    private readonly withdrawWallet: string;
    private readonly USDUnit: bigint = 10000000n; // 10 USDC in smallest unit (6 decimals)
    private readonly minUsdc: bigint = 100000n; // 0.2 USDC * 10^6
    private readonly gasLimitForTransfer: bigint = 100000n; // Updated to reasonable default
    private readonly bufferMultiplier: bigint = 120n; // 20% buffer        
    constructor(
        private readonly prisma: PrismaService,
    ) {
        const masterKey = process.env.MASTER_KEY;
        if (!masterKey) throw new Error('Missing MASTER_KEY in env');
        if (!process.env.WALLET_XPUB_ENC) throw new Error('Missing WALLET_XPUB_ENC in env');
        if (!process.env.WALLET_XPRIV_ENC) throw new Error('Missing WALLET_XPRIV_ENC in env');

        this.xpriv = decryptEnvValue(process.env.WALLET_XPRIV_ENC, masterKey);
        //IN PROD CHANGE TO MATIC
        const rpcUrl = process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org';
        this.provider = new ethers.JsonRpcProvider(rpcUrl);

        const usdcAddress = process.env.USDC_CONTRACT_SEPOLIA_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Official Circle USDC on Sepolia
        if (!usdcAddress) throw new Error('Missing WITHDRAW_WALLET in env');
        const usdcAbi = [
            'function balanceOf(address) view returns (uint256)',
            'function transfer(address,uint256) returns (bool)',
        ];
        this.usdcContract = new ethers.Contract(usdcAddress, usdcAbi, this.provider);
        this.usdcInterface = new ethers.Interface(usdcAbi);

        this.withdrawWallet = process.env.WITHDRAW_WALLET;
        if (!this.withdrawWallet) throw new Error('Missing WITHDRAW_WALLET in env');
    }

    async fundUserWallets(addresses: string[], createMock: boolean = false) {

        const effectiveGasPrice = await this.getEffectiveGasPrice();
        const masterWallet: any = ethers.HDNodeWallet.fromExtendedKey(this.xpriv);
        const wallet = new ethers.Wallet(masterWallet.privateKey, this.provider);
        // Fund wallets
        for (const address of addresses) {
            const DEFAULT_GAS_LIMIT = 65000n; // Consistent with checkWallets
            const MAX_GAS_PRICE = 10000000000n; // 10 Gwei cap
            const cappedGasPrice = effectiveGasPrice > MAX_GAS_PRICE ? MAX_GAS_PRICE : effectiveGasPrice;
            let estimatedGas: bigint;
            try {
                const data = this.usdcInterface.encodeFunctionData('transfer', [address, '']);
                estimatedGas = await this.provider.estimateGas({
                    to: this.usdcContract.target as string,
                    data,
                    from: masterWallet.address,
                });
                estimatedGas = estimatedGas > DEFAULT_GAS_LIMIT ? DEFAULT_GAS_LIMIT : estimatedGas;
            } catch (error) {
                estimatedGas = DEFAULT_GAS_LIMIT;
                console.warn(` - Gas estimation failed for ${address}: ${error.message}`);
            }

            const nativeBalance = await this.provider.getBalance(wallet.address);
            const gasCost = estimatedGas * cappedGasPrice;
            if (nativeBalance < gasCost) {
                console.error(`❌ Insufficient funds for gas in ${address}: ${ethers.formatEther(nativeBalance)} ETH available, ${ethers.formatEther(gasCost)} ETH needed`);
                return null;
            }

            try {
                const data = this.usdcInterface.encodeFunctionData('transfer', [address, this.USDUnit]); // Sending 10 USDC (2e6)
                console.log(`Funding ${address} with 10 USDC`);
                const tx = await wallet.sendTransaction({
                    to: this.usdcContract.target as string,
                    data,
                    gasLimit: estimatedGas,
                    gasPrice: cappedGasPrice,
                });
                console.log(` - Funding TX sent: ${tx.hash}`);

                const receipt = await tx.wait();
                console.log(` - Funding confirmed in block ${receipt.blockNumber}`);
                const user = await this.prisma.userEthAddresses.findFirst({ where: { address } });
                if (createMock) await this.addMockFinishedTransaction(user.userId, address, tx.hash);
            } catch (error) {
                console.error(`❌ Send transaction failed for ${address}: ${error.message}`);
                throw error;
            }
        }
    }

    async addMockFinishedTransaction(userId: number, address: string, txId: string) {

        const mtPelerinMockId = uuidv4()
        let daiEuroRate = await fetchConversionDaiRate('EUR');
        // DAI colateral = same as USDC after fee (first numbers 10 are 10USDC and third 2 is feerate)
        const daiColateral = 10 - (10 * (2 / 100)); // 1:1 with USDC
        const eurAmount = daiColateral / daiEuroRate;

        try {
            const newTx = await this.prisma.mtPelerin.create({
                data: {
                    mtId: mtPelerinMockId,
                    userId: userId,
                    merchant_oid: address,
                    depositStatus: DepositStatus.PROCESSING,
                    mtpelerinStatus: 'finished',
                    paidAmount: eurAmount.toString(),
                    eurAmount: eurAmount,
                    daiColateral: daiColateral,
                    usdcAmount: daiColateral,
                    feeRate: 2,
                    currency: 'EUR',
                    txId: txId,
                    created_at: new Date(),
                },
            });

            if (newTx.id) {
                return { message: 'New mock tx added', status: 200 }
            } else {
                return { message: 'error adding mock tx', status: HttpStatus.BAD_REQUEST }
            }

        } catch (error) {
            console.log('error---->', error);
            throw new HttpException('Failed adding mock mt pelerin tx', HttpStatus.BAD_REQUEST);
        }
    }

    async getWithdrawals(
        page = 1,
        limit = 10,
        filters?: Prisma.WithdrawalsWhereInput,
        orderBy: Prisma.SortOrder = 'desc'
    ) {
        if (page < 1) page = 1;
        const offset = (page - 1) * limit;
        try {
            const withdrawals = await this.prisma.withdrawals.findMany({
                skip: Number(offset),
                take: Number(limit),
                orderBy: [{ created_at: orderBy }],
                select: {
                    userId: true,
                    address: true,
                    withdrawStatus: true,
                    amount: true,
                    feeAmount: true,
                    currency: true,
                    txId: true,
                    created_at: true,
                },
                where: filters,
            });

            const totalCount = await this.prisma.withdrawals.count({ where: filters });

            return {
                data: withdrawals,
                pagination: {
                    totalItems: totalCount || 0,
                    currentPage: page || 1,
                    totalPages: Math.ceil(totalCount / limit) > 0 ? Math.ceil(totalCount / limit) : 1,
                    pageSize: limit,
                },
            };
        } catch (error) {
            console.log('error', error);
            throw new HttpException('Error retrieving deposits try again or contact support.', HttpStatus.BAD_REQUEST);
        }
    }

    async getUserWallets() {
        const uniqueWallets = await this.prisma.mtPelerin.findMany({
            select: { merchant_oid: true },
            distinct: ['merchant_oid'],
        });
        const addresses = uniqueWallets.map(w => w.merchant_oid);

        let totalWallets = 0;
        let totalAmount = 0;
        let totalFees = 0n;

        const feeData = await this.provider.getFeeData();
        const effectiveGasPrice = feeData.maxPriorityFeePerGas || feeData.gasPrice;

        for (const address of addresses) {
            const nativeBalance = await this.provider.getBalance(address);
            const usdcBalance = await this.usdcContract.balanceOf(address);

            if (usdcBalance > this.minUsdc) {
                totalWallets++;
                totalAmount += parseFloat(ethers.formatUnits(usdcBalance, 6));
                const data = this.usdcInterface.encodeFunctionData('transfer', [this.withdrawWallet, usdcBalance]);
                let estimatedGas: bigint;
                try {
                    estimatedGas = await this.provider.estimateGas({
                        to: this.usdcContract.target as string,
                        data,
                        from: address,
                    });
                } catch {
                    estimatedGas = this.gasLimitForTransfer;
                }

                const requiredNative = estimatedGas * effectiveGasPrice;
                if (nativeBalance < requiredNative) {
                    const need = (requiredNative - nativeBalance) * this.bufferMultiplier / 100n;
                    totalFees += need;
                }
            }
            console.log('Balance: ', `${ethers.formatEther(nativeBalance)} eth - ${ethers.formatUnits(usdcBalance, 6)} USDC`);
            await this.delay(1000);
        }

        console.log('totalFees', totalFees);

        return {
            totalWallets,
            totalAmount: totalAmount,
            totalFees: ethers.formatEther(totalFees),
        };
    }

    async getUniqueMerchantWallets(): Promise<string[]> {
        const uniqueWallets = await this.prisma.mtPelerin.findMany({
            select: { merchant_oid: true },
            distinct: ['merchant_oid'],
        });
        const addresses = uniqueWallets.map(w => w.merchant_oid);
        console.log(`[${new Date().toISOString()}] Found ${addresses.length} unique merchant wallets`);
        return addresses;
    }

    async getEffectiveGasPrice(): Promise<bigint> {
        const feeData = await this.provider.getFeeData();
        const gasPrice = feeData.gasPrice;
        const effectiveGasPrice = feeData.maxFeePerGas || gasPrice;
        console.log(`[${new Date().toISOString()}] Current gas price: ${effectiveGasPrice?.toString()}`);
        return effectiveGasPrice;
    }

    async testCheckWallets() {
        const addresses = await this.getUniqueMerchantWallets();
        const effectiveGasPrice = await this.getEffectiveGasPrice();
        return this.checkWallets(addresses, effectiveGasPrice);
    }

    async checkWallets(
        addresses: string[],
        effectiveGasPrice: bigint
    ): Promise<{ needs: { [address: string]: bigint }; eligibleAddresses: string[] }> {
        const needs: { [address: string]: bigint } = {};
        const eligibleAddresses: string[] = [];
        const DEFAULT_GAS_LIMIT = 65000n; // Reduced for optimization
        const MAX_FUNDING = ethers.parseEther("0.01");
        const MAX_GAS_PRICE = 10000000000n; // 10 Gwei cap

        // Cap gas price to avoid high funding during spikes
        const cappedGasPrice = effectiveGasPrice > MAX_GAS_PRICE ? MAX_GAS_PRICE : effectiveGasPrice;

        for (const address of addresses) {
            console.log(`[${new Date().toISOString()}] Checking wallet: ${address}`);
            const nativeBalance = await this.provider.getBalance(address);
            const usdcBalance = await this.usdcContract.balanceOf(address);

            console.log(` - Native balance: ${ethers.formatEther(nativeBalance)} ETH`);
            console.log(` - USDC balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);

            if (usdcBalance > this.minUsdc) {
                eligibleAddresses.push(address);
                console.log(` - Eligible for withdrawal`);

                const data = this.usdcInterface.encodeFunctionData('transfer', [this.withdrawWallet, usdcBalance]);

                let estimatedGas: bigint;
                try {
                    await this.delay(600);
                    estimatedGas = await this.provider.estimateGas({
                        to: this.usdcContract.target as string,
                        data,
                        from: address,
                    });
                    estimatedGas = estimatedGas > DEFAULT_GAS_LIMIT ? DEFAULT_GAS_LIMIT : estimatedGas;
                } catch (error) {
                    estimatedGas = DEFAULT_GAS_LIMIT;
                    console.warn(` - Failed to estimate gas for ${address}: ${error.message}`);
                }

                const requiredNative = estimatedGas * cappedGasPrice;

                let fundingNeeded = requiredNative - nativeBalance;

                if (fundingNeeded <= 0n) {
                    // Has enough balance
                    fundingNeeded = 0n;
                    console.log(" - Sufficient native balance, no funding needed");
                } else {
                    // Needs funding, enforce min/max bounds
                    const MIN_FUNDING = ethers.parseEther("0.0001");
                    fundingNeeded = fundingNeeded < MIN_FUNDING ? MIN_FUNDING : fundingNeeded;
                    fundingNeeded = fundingNeeded > MAX_FUNDING ? MAX_FUNDING : fundingNeeded;

                    console.log(` - Needs funding: ${ethers.formatEther(fundingNeeded)} ETH`);
                    needs[address] = fundingNeeded;
                }

            } else {
                console.log(` - Not enough USDC, skipping`);
            }

            await this.delay(1000);
        }

        return { needs, eligibleAddresses };
    }

    getMasterSigner(): ethers.Wallet {
        console.log(`[${new Date().toISOString()}] Setting up master wallet...`);
        const masterWallet: any = ethers.HDNodeWallet.fromExtendedKey(this.xpriv);
        const masterSigner = new ethers.Wallet(masterWallet.privateKey, this.provider);
        return masterSigner;
    }

    async singleWithdrawProcess() {
        console.log(`[${new Date().toISOString()}] Starting withdrawal process...`);

        const addresses = await this.getUniqueMerchantWallets();
        const effectiveGasPrice = await this.getEffectiveGasPrice();
        await this.delay(1000);

        const { needs, eligibleAddresses } = await this.checkWallets(addresses, effectiveGasPrice);

        const masterSigner: any = this.getMasterSigner();

        await this.fundWallets(needs, masterSigner);

        const { txIds, failedAddresses } = await this.processWithdrawals(eligibleAddresses);

        console.log(`[${new Date().toISOString()}] Withdrawal process completed`);
        console.log(`✅ Successful TXs: ${txIds.length}, ❌ Failed: ${failedAddresses.length}`);

        return { txIds, failedAddresses };
    }
    private async fundWallets(needs: { [address: string]: bigint }, masterSigner: ethers.Wallet) {
        const masterBalance = await this.provider.getBalance(masterSigner.address);
        const gasPrice = await this.getEffectiveGasPrice();
        const MAX_GAS_PRICE = 10000000000n; // 10 Gwei cap
        const cappedGasPrice = gasPrice > MAX_GAS_PRICE ? MAX_GAS_PRICE : gasPrice;

        for (const [address, amount] of Object.entries(needs)) {
            // Validate address
            if (!ethers.isAddress(address)) {
                console.error(`❌ Invalid address: ${address}`);
                continue;
            }

            // Fetch user data
            const user = await this.prisma.userEthAddresses.findFirst({
                where: { address },
            });
            if (!user) {
                console.error(`❌ No user found for address: ${address}`);
                continue;
            }

            // Estimate gas dynamically
            let gasLimit: bigint;
            try {
                gasLimit = await this.provider.estimateGas({
                    to: address,
                    value: amount,
                    from: masterSigner.address,
                });
            } catch (error) {
                gasLimit = 21000n; // Fallback to standard ETH transfer gas limit
                console.warn(` - Gas estimation failed for ${address}: ${error.message}`);
            }

            const gasCostPerTx = cappedGasPrice * gasLimit;
            const totalCost = amount + gasCostPerTx;

            console.log(
                `Master wallet ${masterSigner.address} balance: ${ethers.formatEther(masterBalance)} ETH, ` +
                `needs ${ethers.formatEther(totalCost)} ETH for ${address}`,
            );

            if (masterBalance < totalCost) {
                console.error(
                    `❌ Master wallet has insufficient funds: ${ethers.formatEther(masterBalance)} ETH available, ` +
                    `${ethers.formatEther(totalCost)} ETH needed for ${address}`,
                );
                continue;
            }

            try {
                console.log(`[${new Date().toISOString()}] Funding wallet ${address} with ${ethers.formatEther(amount)} ETH`);
                const tx = await masterSigner.sendTransaction({
                    to: address,
                    value: amount,
                    gasLimit,
                    gasPrice: cappedGasPrice,
                });
                console.log(` - Funding TX sent: ${tx.hash}`);

                const receipt = await tx.wait();
                if (receipt.status !== 1) {
                    throw new Error(`Transaction failed with status ${receipt.status}`);
                }

                const feeAmount = ethers.formatEther(receipt.gasUsed * cappedGasPrice);

                await this.prisma.nativeFunding.create({
                    data: {
                        userId: user.userId,
                        address,
                        fundStatus: WithdrawStatus.Completed,
                        amount: parseFloat(ethers.formatEther(amount)),
                        currency: 'ETH', // Corrected from 'USDC'
                        feeAmount: Number(feeAmount),
                        txId: tx.hash,
                        last_modified: new Date(),
                    },
                });

                console.log(` - Funding confirmed in block ${receipt.blockNumber}`);
            } catch (error) {
                console.error(`❌ Failed to fund ${address}: ${error.message}`);
            }

            await this.delay(1000); // Configurable via env if needed
        }
    }

    async withdrawFromWallet(address: string) {
        // Validate address
        if (!ethers.isAddress(address)) {
            throw new Error(`Invalid address: ${address}`);
        }

        const userAddr = await this.prisma.userEthAddresses.findUnique({ where: { address } });
        if (!userAddr) {
            throw new Error(`No UserEthAddresses entry for ${address}`);
        }

        let wallet: ethers.Wallet;
        try {
            const { encryptedData, iv, authTag } = JSON.parse(userAddr.encryption_key);
            const privKey = decryptPrivateKey(encryptedData, iv, authTag); // Assumed helper function
            wallet = new ethers.Wallet(privKey, this.provider);
        } catch (error) {
            console.error(`❌ Failed to decrypt private key for ${address}: ${error.message}`);
            throw new Error(`Decryption failed for ${address}`);
        }

        const usdcBalance = await this.usdcContract.balanceOf(address);
        if (usdcBalance <= this.minUsdc || usdcBalance === 0n) {
            console.log(` - Balance dropped below minimum or zero, skipping: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
            return null;
        }

        const effectiveGasPrice = await this.getEffectiveGasPrice();
        const MAX_GAS_PRICE = 10000000000n; // 10 Gwei cap
        const cappedGasPrice = effectiveGasPrice > MAX_GAS_PRICE ? MAX_GAS_PRICE : effectiveGasPrice;
        const DEFAULT_GAS_LIMIT = 65000n;

        let estimatedGas: bigint;
        try {
            const data = this.usdcInterface.encodeFunctionData('transfer', [this.withdrawWallet, usdcBalance]);
            estimatedGas = await this.provider.estimateGas({
                to: this.usdcContract.target as string,
                data,
                from: address,
            });
            estimatedGas = estimatedGas > DEFAULT_GAS_LIMIT ? DEFAULT_GAS_LIMIT : estimatedGas;
        } catch (error) {
            estimatedGas = DEFAULT_GAS_LIMIT;
            console.warn(` - Gas estimation failed for ${address}: ${error.message}`);
        }

        const nativeBalance = await this.provider.getBalance(address);
        const gasCost = estimatedGas * cappedGasPrice;
        if (nativeBalance < gasCost) {
            console.error(
                `❌ Insufficient funds for gas in ${address}: ${ethers.formatEther(nativeBalance)} ETH available, ` +
                `${ethers.formatEther(gasCost)} ETH needed`,
            );
            return null;
        }

        try {
            const data = this.usdcInterface.encodeFunctionData('transfer', [this.withdrawWallet, usdcBalance]);
            const tx = await wallet.sendTransaction({
                to: this.usdcContract.target as string,
                data,
                gasLimit: estimatedGas,
                gasPrice: cappedGasPrice,
            });
            console.log(` - Withdrawal TX sent: ${tx.hash} cappedGasPrice: ${cappedGasPrice}`);

            const receipt = await tx.wait();
            if (receipt.status !== 1) {
                throw new Error(`Transaction failed with status ${receipt.status}`);
            }

            console.log(` - Withdrawal confirmed in block ${receipt.blockNumber}`);

            const feeAmount = ethers.formatEther(receipt.gasUsed * cappedGasPrice);
            console.log(` - Fee for withdrawal: ${feeAmount} ETH`);


            await this.prisma.withdrawals.create({
                data: {
                    userId: userAddr.userId,
                    address,
                    withdrawStatus: WithdrawStatus.Completed, // Use enum instead of hardcoded value
                    amount: Number(ethers.formatUnits(usdcBalance, 6)), // USDC has 6 decimals
                    currency: 'USDC',
                    feeAmount: Number(feeAmount),
                    txId: tx.hash,
                },
            });

            return { txHash: tx.hash, amount: usdcBalance.toString() };
        } catch (error) {
            console.error(`❌ Send transaction failed for ${address}: ${error.message}`);
            throw error;
        }
    }

    private async processWithdrawals(eligibleAddresses: string[]): Promise<{ txIds: string[]; failedAddresses: string[] }> {
        const txIds: string[] = [];
        const failedAddresses: string[] = [];

        for (const address of eligibleAddresses) {
            console.log(`[${new Date().toISOString()}] Processing withdrawal for ${address}`);

            try {
                const tx: any = await this.withdrawFromWallet(address);
                if (tx) txIds.push(tx.hash);
            } catch (error) {
                console.error(`❌ Withdrawal failed for ${address}: ${error.message}`);
                failedAddresses.push(address);
            }

            await this.delay(1000);
        }


        this.sendCompletionEmail()
        return { txIds, failedAddresses };
    }

    async fundSingleWallet(address: string, amount: bigint) {
        const masterSigner = this.getMasterSigner();
        try {
            console.log(`[${new Date().toISOString()}] Funding wallet ${address} with ${ethers.formatEther(amount)} ETH`);
            const tx = await masterSigner.sendTransaction({
                to: address,
                value: amount,
                gasLimit: 21000n
            });
            console.log(` - Funding TX sent: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(` - Funding confirmed in block ${receipt.blockNumber}`);
            return { status: 'funded', txHash: tx.hash, amount: amount.toString() }; // Return txHash for tracking
        } catch (error) {
            console.error(`❌ Failed to fund ${address}: ${error.message}`);
            throw error;
        }
    }

    async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async sendCompletionEmail() {

        const withdrawals = await this.prisma.withdrawals.findMany({})
        const funding = await this.prisma.nativeFunding.findMany({})

        const adminEmail = process.env.ADMIN_EMAIL || "Ken.cmd32@proton.me"; // Configure in .env

        // Categorize withdrawals
        const successfulFunds = funding.filter(j => j.fundStatus === WithdrawStatus.Completed);
        const failedFunds = funding.filter(j => j.fundStatus === WithdrawStatus.Failed);
        const successWithdrawals = withdrawals.filter(j => j.withdrawStatus === WithdrawStatus.Completed);
        const failedWithdrawals = withdrawals.filter(j => j.withdrawStatus === WithdrawStatus.Failed);


        // Resume data
        const totalWallets = new Set(withdrawals.map(j => j.address)).size;

        const totalEth = successfulFunds.reduce((sum, j) => sum + j.amount, 0);
        console.log('totalEth', totalEth);
        const totalUSDC = successWithdrawals.reduce((sum, j) => sum + j.amount, 0);
        console.log('totalUSDC', totalUSDC);

        // Prepare email content
        const summaryHtml = getWithdrawTemplate(
            totalWallets,
            totalUSDC,
            totalEth,
            successfulFunds,
            failedFunds,
            successWithdrawals,
            failedWithdrawals
        );

        await adminWithdrawEmail('Ken.cmd32@proton.me', summaryHtml)

        try {
            console.log(`[${new Date().toISOString()}] Email sent to ${adminEmail}`);
        } catch (error: any) {
            console.error(`[${new Date().toISOString()}] Failed to send email: ${error.message}`);
        }
    }
}