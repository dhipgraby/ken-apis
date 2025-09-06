import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { UsersService } from './services/users.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';
import { BalancesService } from 'lib/common/services/balances.service';

@ApiBearerAuth()
@ApiTags('User Profile')
@Controller('user')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly balancesService: BalancesService,
  ) { }

  @Get()
  getHello(): string {
    return this.usersService.getHello();
  }

  // WALLET ENDPOINTS
  @UseGuards(JwtAuthGuard)
  @Get('create-eth-address')
  createWallet(@Request() req) {
    const userId = req.user.id;
    return this.usersService.generateUserEthAddress(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('regenerate-wallet')
  regenerateWallet(@Request() req) {
    const userId = req.user.id;
    return this.usersService.regenerateWallet(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-wallet')
  getWallet(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getUserEthAddress(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sign-message')
  async signMessage(@Request() req, @Body() body: { message: string }) {
    const userId = req.user.id;
    if (!body.message) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }

    return this.usersService.signMessage(userId, body.message);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-balance')
  getBalance(@Request() req) {
    const userId = req.user.id;
    return this.balancesService.getUserBalance(Number(userId));
  }
}
