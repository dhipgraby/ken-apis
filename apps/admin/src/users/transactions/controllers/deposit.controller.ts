import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { DepositsService } from 'lib/common/transactions/deposits.service';
import { DepositMessageDto } from 'lib/common/dto/transactions/transactions.dto';
import { Prisma } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from 'lib/common/auth/admin-guard';

@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) { }

  @Get('all')
  async getDeposits(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('userId') userId?: number,
    @Query('id') id?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('startAmount') startAmount?: number,
    @Query('endAmount') endAmount?: number,
    @Query('depositStatus') depositStatus?: number,
    @Query('Account') Account?: string,
    @Query('orderBy') orderBy?: 'desc' | 'asc',
  ) {
    const filters: Prisma.DepositsWhereInput = {};

    if (userId) {
      filters.userId = Number(userId);
    }

    if (id) {
      filters.id = Number(id);
    }

    if (startDate || endDate) {
      filters.created_at = {};
      if (startDate) {
        filters.created_at.gte = new Date(startDate).toISOString();
      }
      if (endDate) {
        filters.created_at.lte = new Date(endDate).toISOString();
      }
    }

    if (startAmount || endAmount) {
      filters.eurAmount = {};
      if (startAmount) {
        filters.eurAmount.gte = Number(startAmount) - 1;
      }
      if (endAmount) {
        filters.eurAmount.lte = Number(endAmount) + 1;
      }
    }
    if (depositStatus !== undefined) {
      filters.depositStatus = Number(depositStatus);
    }
    if (Account) {
      filters.account = { contains: Account };
    }

    return this.depositsService.getAllAdminDeposits(
      Number(page),
      Number(limit),
      filters,
      orderBy,
    );
  }

  @Post('approve')
  async approveDeposit(@Body() body: { id: number }) {
    const id = body.id;
    if (!id || typeof id !== 'number')
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'deposit id is required',
      };
    return await this.depositsService.approveDeposit(Number(id));
  }

  @Post('deny')
  async denyDeposit(@Body() body: DepositMessageDto) {
    const id = body.id;
    if (!id || typeof id !== 'number')
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'deposit id is required',
      };
    return await this.depositsService.denyDeposit({
      id: Number(id),
      message: body.message,
    });
  }

  @Post('request-info')
  async requestDepositInfo(@Body() body: DepositMessageDto) {
    const id = body.id;
    if (!id || typeof id !== 'number')
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'deposit id is required',
      };
    return await this.depositsService.requestStateDeposit({
      id: Number(id),
      message: body.message,
    });
  }

  @Get('export')
  async exportDeposits(@Res() res, @Query('userId') userId?: number) {
    const buffer = await this.depositsService.exportAllDeposits(
      Number(userId),
      true,
    );
    return res
      .set('Content-Disposition', `attachment; filename=example.xlsx`)
      .send(buffer);
  }
}
