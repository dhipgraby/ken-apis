import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';
import { CreateDepositDto } from 'lib/common/dto/transactions/transactions.dto';
import { DepositsService } from 'lib/common/transactions/deposits.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
  ) { }

  @Post('create')
  async createDeposit(
    @Request() req,
    @Body() createDepositDto: CreateDepositDto,
  ) {
    const userId = req.user.id;
    return await this.depositsService.createDeposit(createDepositDto, userId);
  }

  @Get('all')
  async getDeposits(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
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
    const userId = req.user.id;

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

    return this.depositsService.getUserDeposits(
      userId,
      Number(page),
      Number(limit),
      filters,
      orderBy,
    );
  }

  @Post('delete')
  async deleteDeposit(@Request() req, @Body() body: { id: number }) {
    const userId = req.user.id;
    const id = body.id;
    if (!id || typeof id !== 'number')
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'deposit id is required',
      };
    return await this.depositsService.deleteUserDeposit(userId, Number(id));
  }

  @Get('export')
  async exportDeposits(@Res() res, @Request() req) {
    const userId = req.user.id;
    const buffer = await this.depositsService.exportAllDeposits(Number(userId));
    return res
      .set('Content-Disposition', `attachment; filename=example.xlsx`)
      .send(buffer);
  }
}
