import { Controller, Get, Post, Query, Body, HttpStatus } from '@nestjs/common';
import { DepositMessageDto } from 'lib/common/dto/transactions/transactions.dto';
import { MtPelerinService } from 'lib/common/transactions/mtpelerin.service';
import { Prisma } from '@prisma/client';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from 'lib/common/auth/admin-guard';

@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('mtpelerin')
export class MtPelerinController {
  constructor(private readonly mtPelerinService: MtPelerinService) { }

  @Get('fetch-transactions')
  async fetch() {
    const now = new Date();
    const fromDate = `${now.getFullYear()}-01-01`;
    const toDate = `${now.getFullYear() + 1}-01-01`;
    return this.mtPelerinService.fetchMtPelerinTransactions(fromDate, toDate);
  }

  @Post('approve')
  async approve(@Body() body: { id: number }) {
    return this.mtPelerinService.approveMtPelerinDeposit(body.id);
  }

  @Post('deny')
  async denyDeposit(@Body() body: DepositMessageDto) {
    const id = body.id;
    if (!id || typeof id !== 'number')
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'deposit id is required',
      };
    return await this.mtPelerinService.denyDeposit({
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
    return await this.mtPelerinService.requestStateDeposit({
      id: Number(id),
      message: body.message,
    });
  }

  @Get('all')
  async getDeposits(
    @Query('userId') userId?: number,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('id') id?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('startAmount') startAmount?: number,
    @Query('endAmount') endAmount?: number,
    @Query('depositStatus') depositStatus?: number,
    @Query('orderBy') orderBy?: 'desc' | 'asc',
  ) {
    const filters: Prisma.MtPelerinWhereInput = {};

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

    if (userId) {
      filters.userId = Number(userId);
    }

    return this.mtPelerinService.getAllAdminDeposits(
      Number(page),
      Number(limit),
      filters,
      orderBy,
    );
  }

}
