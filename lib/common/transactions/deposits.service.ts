import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CoreService } from 'apps/users/src/core/core.service';
import { CreateDepositDto, DepositMessageDto } from '../dto/transactions/transactions.dto';
import { DepositStatus } from '../types/deposit.types';
import { UserStatus } from '../types/user.types';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { UserRoles } from 'apps/users/src/kyc/dto/user.dto';
import { calculateDaiAmount, fetchConversionRate } from 'utils/colateral.calculation';
import { sendDepositDenialEmail, sendDepositRequestEmail, sendDepositApprovalEmail } from 'lib/mail/mail';

@Injectable()
export class DepositsService {
    constructor(
        private prisma: PrismaService,
        private coreService: CoreService,
    ) { }

    async approveDeposit(depositId: number) {
        const deposit = await this.prisma.deposits.findUnique({
            where: { id: depositId },
        });

        //DEPOSIT VALIDATION
        if (!deposit) throw new HttpException('Deposit not found', HttpStatus.NOT_FOUND);
        if (deposit.depositStatus === DepositStatus.SUCCESS) throw new HttpException('This deposit is already approved.', HttpStatus.CONFLICT);
        if (deposit.approved_at !== null) throw new HttpException('This deposit is already approved at some date.', HttpStatus.CONFLICT);
        //USER VALIDATION
        const user = await this.prisma.balances.findUnique({ where: { userId: deposit.userId } });
        if (!user) throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        const userProfile = await this.prisma.user.findUnique({ where: { id: deposit.userId } });
        //USER PROFILE VALIDATION
        if (!userProfile) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        if (userProfile.userStatus !== UserStatus.VERIFIED) throw new HttpException('This is not a verified user.', HttpStatus.CONFLICT);
        if (!user) throw new HttpException('User balance profile not found', HttpStatus.NOT_FOUND);
        if (user.lastDepositId === deposit.id) throw new HttpException('This deposit was already credited', HttpStatus.NOT_FOUND);

        const userEurBalance = user.eur;
        const userDaiBalance = user.daiColateral;
        const newEurBalance = Number(userEurBalance) + Number(deposit.eurAmount);

        // Fetch conversion rate and calculate Dai collateral
        const conversionRate = await fetchConversionRate("DAI");
        const daiAmountWithMarkup = calculateDaiAmount(Number(deposit.eurAmount), conversionRate);
        const newDaiBalance = Number(userDaiBalance) + Number(daiAmountWithMarkup);

        await sendDepositApprovalEmail(userProfile.email, process.env.VENDORS_PORTAL);

        await this.prisma.$transaction(async (prisma) => {
            await prisma.deposits.update({
                where: { id: depositId },
                data: {
                    daiColateral: Number(daiAmountWithMarkup.toFixed(2)),
                    depositStatus: DepositStatus.SUCCESS,
                    approved_at: new Date().toISOString(),
                },
            });

            await prisma.balances.update({
                where: { userId: deposit.userId },
                data: {
                    daiColateral: Number(newDaiBalance.toFixed(2)),
                    eur: newEurBalance,
                    lastDepositId: deposit.id,
                    last_modified: new Date().toISOString()
                },
            });
        });

        return {
            status: 200,
            message: "Deposit transaction approved",
        };
    }

    async createDeposit(depositData: CreateDepositDto, userId: number) {
        // Validate user
        const user = await this.coreService.userValidation(userId);

        if (user.userStatus !== UserStatus.VERIFIED) {
            throw new HttpException('User is not verified', HttpStatus.FORBIDDEN);
        }

        if (user.rol === UserRoles.INDIVIDUAL) {
            await this.coreService.verifyIndividualIdExpiration(user);
        }

        if (user.rol === UserRoles.BUSINESS) {
            await this.coreService.verifyBusinessIdExpiration(user);
        }

        // Check if user already has an active deposit
        const activeDeposit = await this.prisma.deposits.findFirst({
            where: {
                userId: user.id,
                OR: [
                    { depositStatus: DepositStatus.PROCESSING },
                    { depositStatus: DepositStatus.REQUEST },
                ],
            },
        });

        if (activeDeposit) {
            throw new HttpException('User already has an active deposit or deposit in request status.', HttpStatus.CONFLICT);
        }

        // Retrieve admin configuration
        const adminConfig = await this.prisma.adminConfig.findFirst({});
        const vendorsConfig = await this.prisma.vendorsConfig.findUnique({ where: { userId: user.id } });

        if (!adminConfig) {
            throw new HttpException('Admin configuration not found. Please contact support.', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Validate deposit data
        if (!depositData.eurAmount || depositData.eurAmount <= 0) {
            throw new HttpException('Invalid deposit amount', HttpStatus.BAD_REQUEST);
        }

        const userBalance = await this.prisma.balances.findUnique({
            where: {
                userId: userId
            }
        });

        if (!userBalance) {
            //CREATING USER BALANCE 
            await this.prisma.balances.upsert({
                where: { userId: userId },
                create: {
                    userId: userId,
                    eur: 0,
                    usd: 0,
                    daiColateral: 0
                },
                update: {
                    last_modified: new Date().toISOString(),
                },
            });
        }

        const customFeeRate = user.rol === UserRoles.BUSINESS
            ? (vendorsConfig.businessFeeRate ?? adminConfig.feeRate)
            : (vendorsConfig.feeRate ?? adminConfig.feeRate);

        const bankAccount = vendorsConfig.bankAccount || adminConfig.bankAccount

        // Create new deposit
        try {
            await this.prisma.deposits.create({
                data: {
                    userId: user.id,
                    userRole: user.rol,
                    depositStatus: DepositStatus.PROCESSING,
                    eurAmount: depositData.eurAmount,
                    feeRate: customFeeRate,
                    isApproved: false,
                    keyWord: vendorsConfig.keyWord || adminConfig.keyWord,
                    method: 'Bank-transfer - Bank name: ' + vendorsConfig.bankName || adminConfig.bankName,
                    account: "BicSwift: " + (vendorsConfig.bicSwift || adminConfig.bicSwift) + " - Account: " + bankAccount,
                    created_at: new Date(),
                },
            });

            return {
                status: HttpStatus.OK,
                message: "New deposit request created.",
            };
        } catch (error) {
            console.error('Error creating deposit:', error);
            throw new HttpException('Error creating deposit', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getUserDeposits(
        userId: number,
        page = 1,
        limit = 10,
        filters?: Prisma.DepositsWhereInput,
        orderBy: 'desc' | 'asc' = 'desc',
    ) {
        await this.coreService.userValidation(userId);
        if (page < 1) page = 1;
        const offset = (page - 1) * limit;

        try {
            const deposits = await this.prisma.deposits.findMany({
                skip: Number(offset),
                take: Number(limit),
                orderBy: [
                    {
                        id: orderBy,
                    },
                ],
                where: { ...filters, userId },
                select: {
                    id: true,
                    depositStatus: true,
                    eurAmount: true,
                    message: true,
                    daiColateral: true,
                    feeRate: true,
                    isApproved: true,
                    keyWord: true,
                    method: true,
                    account: true,
                    approved_at: true,
                    created_at: true,
                }
            });

            const totalCount = await this.prisma.deposits.count({
                where: { ...filters, userId },
            });

            return {
                data: deposits,
                pagination: {
                    totalItems: totalCount,
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    pageSize: limit,
                },
            };
        } catch (error) {
            console.error('Error retrieving deposits:', error);
            throw new HttpException('Error retrieving deposits', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getAllDeposits() {
        try {
            const deposits = await this.prisma.deposits.findMany({
                orderBy: [
                    {
                        id: 'desc',
                    },
                ],
            });
            return deposits;
        } catch (error) {
            console.error('Error retrieving deposits:', error);
            throw new HttpException('Error retrieving deposits', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getAllAdminDeposits(
        page = 1,
        limit = 10,
        filters?: Prisma.DepositsWhereInput,
        orderBy: 'desc' | 'asc' = 'asc',
    ) {
        if (page < 1) page = 1;
        const offset = (page - 1) * limit;

        try {
            const deposits = await this.prisma.deposits.findMany({
                skip: Number(offset),
                take: Number(limit),
                orderBy: [
                    {
                        id: orderBy,
                    },
                ],
                where: filters
            });

            const totalCount = await this.prisma.deposits.count({
                where: filters,
            });

            return {
                data: deposits,
                pagination: {
                    totalItems: totalCount,
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    pageSize: limit,
                },
            };
        } catch (error) {
            console.error('Error retrieving deposits:', error);
            throw new HttpException('Error retrieving deposits', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async denyDeposit(depositData: DepositMessageDto) {
        const deposit = await this.prisma.deposits.findUnique({
            where: { id: depositData.id },
        });

        const user = await this.prisma.user.findUnique({ where: { id: deposit.userId } })
        if (!user) throw new HttpException("User not found", HttpStatus.NOT_FOUND);

        if (!deposit) throw new HttpException('Deposit not found', HttpStatus.NOT_FOUND);
        if (deposit.depositStatus === DepositStatus.SUCCESS) throw new HttpException('This deposit is already completed', HttpStatus.CONFLICT);
        if (deposit.depositStatus === DepositStatus.DENIED) throw new HttpException('This deposit is already denied', HttpStatus.CONFLICT);

        await sendDepositDenialEmail(user.email, depositData.message, process.env.VENDORS_PORTAL);

        await this.prisma.deposits.update({
            where: { id: depositData.id },
            data: { depositStatus: DepositStatus.DENIED, message: depositData.message },
        });

        return {
            status: 200,
            message: "Deposit transaction status changed to denied",
        };
    }

    async requestStateDeposit(depositData: DepositMessageDto) {
        const deposit = await this.prisma.deposits.findUnique({
            where: { id: depositData.id },
        });

        const user = await this.prisma.user.findUnique({ where: { id: deposit.userId } })
        if (!user) throw new HttpException("User not found", HttpStatus.NOT_FOUND);

        if (!deposit) throw new HttpException('Deposit not found', HttpStatus.NOT_FOUND);
        if (deposit.depositStatus === DepositStatus.SUCCESS) throw new HttpException('This deposit is completed', HttpStatus.CONFLICT);

        await sendDepositRequestEmail(user.email, depositData.message, process.env.VENDORS_PORTAL);

        await this.prisma.deposits.update({
            where: { id: depositData.id },
            data: { depositStatus: DepositStatus.REQUEST, message: depositData.message },
        });

        return {
            status: 200,
            message: "Deposit transaction status changed to request",
        };
    }

    async exportAllDeposits(userId?: number, addUser: boolean = false) {
        const deposits = userId ? await this.prisma.deposits.findMany({
            where: { userId }
        }) : await this.prisma.deposits.findMany();

        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet('Deposits');

        // Define the columns with or without userId based on addUser flag
        worksheet.columns = addUser
            ? [
                { header: 'User ID', key: 'userId' },
                { header: 'ID', key: 'id' },
                { header: 'Deposit Status', key: 'depositStatus' },
                { header: 'EUR Amount', key: 'eurAmount' },
                { header: 'DAI Colateral', key: 'daiColateral' },
                { header: 'Fee Rate', key: 'feeRate' },
                { header: 'Key Word', key: 'keyWord' },
                { header: 'Method', key: 'method' },
                { header: 'Account', key: 'account' },
                { header: 'Approved At', key: 'approved_at' },
                { header: 'Created At', key: 'created_at' },
            ]
            : [
                { header: 'ID', key: 'id' },
                { header: 'Deposit Status', key: 'depositStatus' },
                { header: 'EUR Amount', key: 'eurAmount' },
                { header: 'DAI Colateral', key: 'daiColateral' },
                { header: 'Fee Rate', key: 'feeRate' },
                { header: 'Key Word', key: 'keyWord' },
                { header: 'Method', key: 'method' },
                { header: 'Account', key: 'account' },
                { header: 'Approved At', key: 'approved_at' },
                { header: 'Created At', key: 'created_at' },
            ];

        deposits.forEach(deposit => {
            const formattedDeposit: any = {
                ...deposit,
                depositStatus: this.getDepositStatusText(deposit.depositStatus as DepositStatus),
            };

            if (!userId) formattedDeposit.userRole = this.getUserRole(deposit.userRole as UserRoles);
            if (addUser) formattedDeposit.userId = deposit.userId;

            worksheet.addRow(formattedDeposit);
        });

        // Add a footer row
        const footerText = 'Exported deposits generated by Ken. Confidential.';
        const companyInfoText = 'Company: Trade Invx Ltd. Commercial register number: 207649559. Head office and registered office: Vitosha Street No. 4, Sredets district, Sofia 1000, Bulgaria.';
        const numberOfColumns = worksheet.columns.length;

        if (userId) {
            const user = await this.coreService.userValidation(userId);
            let userText: string;
            if (user.rol === UserRoles.INDIVIDUAL) {
                const userInfo = await this.prisma.personalInformation.findUnique({
                    where: { userId }
                });
                userText = "User : " + userInfo.firstName + " " + userInfo.lastName;
            }

            if (user.rol === UserRoles.BUSINESS) {
                const companyInfo = await this.prisma.businessCompanyInfo.findUnique({
                    where: { userId }
                });
                userText = "Company : " + companyInfo.companyName;
            }
            const userRow = new Array(numberOfColumns).fill('');
            userRow[0] = userText;
            worksheet.addRow([]);
            worksheet.addRow(userRow);
            // Merge the footer cells to make it span the entire width of the worksheet
            worksheet.mergeCells(`A${((worksheet.lastRow.number))}:${String.fromCharCode(64 + numberOfColumns)}${(worksheet.lastRow.number)}`);
        }

        const footerRow = new Array(numberOfColumns).fill('');
        footerRow[0] = footerText;
        worksheet.addRow([]);
        worksheet.addRow(footerRow);
        // Merge the footer cells to make it span the entire width of the worksheet
        worksheet.mergeCells(`A${worksheet.lastRow.number}:${String.fromCharCode(64 + numberOfColumns)}${worksheet.lastRow.number}`);

        // Add company information row
        const companyInfoRow = new Array(numberOfColumns).fill('');
        companyInfoRow[0] = companyInfoText;
        worksheet.addRow([]);
        worksheet.addRow(companyInfoRow);
        // Merge the company info cells to make it span the entire width of the worksheet
        worksheet.mergeCells(`A${worksheet.lastRow.number}:${String.fromCharCode(64 + numberOfColumns)}${worksheet.lastRow.number}`);

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }

    getDepositStatusText(status: DepositStatus): string {
        switch (status) {
            case DepositStatus.PROCESSING:
                return 'Processing';
            case DepositStatus.SUCCESS:
                return 'Success';
            case DepositStatus.DENIED:
                return 'Denied';
            case DepositStatus.REQUEST:
                return 'Request';
            default:
                return 'Unknown Status';
        }
    }

    getUserRole(role: UserRoles): string {
        switch (role) {
            case UserRoles.NO_ROLE:
                return 'No role';
            case UserRoles.INDIVIDUAL:
                return 'Individual';
            case UserRoles.BUSINESS:
                return 'Business';
            default:
                return 'Unknown Status';
        }
    }

    async deleteUserDeposit(userId: number, depositId: number) {
        // Validate user
        await this.coreService.userValidation(userId);

        const user = await this.coreService.getUser(userId);

        if (user.userStatus !== 1) {
            throw new HttpException('User is not verified', HttpStatus.FORBIDDEN);
        }

        // Check if the deposit exists and its depositStatus is 0
        const deposit = await this.prisma.deposits.findUnique({
            where: { id: depositId },
        });

        if (!deposit) throw new HttpException('Deposit not found', HttpStatus.NOT_FOUND);

        if (deposit.userId !== userId) throw new HttpException('Unauthorized access to deposit', HttpStatus.UNAUTHORIZED);

        if (deposit.depositStatus === DepositStatus.SUCCESS || deposit.depositStatus === DepositStatus.DENIED) throw new HttpException('Deposit is not in a deletable state', HttpStatus.CONFLICT);

        try {
            await this.prisma.deposits.delete({
                where: { id: depositId },
            });

            return {
                status: HttpStatus.OK,
                message: 'Deposit deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting deposit:', error);
            throw new HttpException('Error deleting deposit', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}