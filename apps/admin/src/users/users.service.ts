import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { UserService } from 'apps/auth/src/users/users.service';
import { UserStatus } from 'lib/common/types/user.types';
import { Prisma } from '@prisma/client';
import { VendorsConfigDto } from './dto/settings.dto';
import {
  sendAccountApprovalEmail,
  sendBanNotificationEmail,
  sendInformationRequestEmail,
} from 'lib/mail/mail';
import { HDNodeWallet } from 'ethers';
import { encryptWallet } from 'lib/utils/crypto.utils';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
  ) { }

  async getUsers(
    page = 1,
    limit = 10,
    filters?: Prisma.UserWhereInput,
    orderBy: 'desc' | 'asc' = 'desc',
  ) {
    if (page < 1) page = 1;
    const offset = (page - 1) * limit;

    try {
      const users = await this.prisma.user.findMany({
        skip: Number(offset),
        take: Number(limit),
        orderBy: [
          {
            id: orderBy,
          },
        ],
        where: filters,
        select: {
          id: true,
          username: true,
          email: true,
          email_verified: true,
          rol: true,
          userStatus: true,
          last_login: true,
          last_modified: true,
          created_at: true,
          isTwoFactorEnabled: true,
        },
      });

      const totalCount = await this.prisma.user.count({
        where: filters,
      });

      return {
        data: users,
        pagination: {
          totalItems: totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          pageSize: limit,
        },
      };
    } catch (error) {
      throw new HttpException('Users not found', HttpStatus.NOT_FOUND);
    }
  }

  async getSingle(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          email_verified: true,
          rol: true,
          userStatus: true,
          last_login: true,
          last_modified: true,
          created_at: true,
          isTwoFactorEnabled: true,
          isTwoFactorSmsEnabled: true,
        },
      });

      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      const userBalance = await this.prisma.balances.findUnique({
        where: { userId: userId },
      });

      if (userBalance)
        user['balance'] = {
          eur: userBalance.eur,
          daiColateral: userBalance.daiColateral,
        };


      return user;
    } catch (error) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
  }


  async editUserConfig(userId: number, vendorsConfigDto: VendorsConfigDto) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      const data = {
        keyWord: vendorsConfigDto.keyWord,
        bankAccount: vendorsConfigDto.bankAccount,
        bankName: vendorsConfigDto.bankName,
        bicSwift: vendorsConfigDto.bicSwift,
        last_modified: new Date().toISOString(),
      };

      return {
        message: 'User configuration updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      console.error('Error updating user configuration:', error);
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async editAdminConfig(userId: number, vendorsConfigDto: VendorsConfigDto) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      const data = {
        keyWord: vendorsConfigDto.keyWord,
        bankAccount: vendorsConfigDto.bankAccount,
        bankName: vendorsConfigDto.bankName,
        bicSwift: vendorsConfigDto.bicSwift,
        last_modified: new Date().toISOString(),
      };

      return {
        message: 'User configuration updated successfully',
        status: HttpStatus.OK,
      };
    } catch (error) {
      console.error('Error updating user configuration:', error);
      if (error instanceof HttpException) {
        throw error;
      } else {
        throw new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async approve(userId: number) {
    // Retrieve admin configuration 
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      await sendAccountApprovalEmail(user.email, process.env.VENDORS_PORTAL);
      //UPDATING STATE TO VERIFIED
      await this.userService.updateUser({
        where: { id: userId },
        data: {
          userStatus: UserStatus.VERIFIED,
        },
      });

      return { status: 200, message: 'User approved!' };
    } catch (error) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
  }

  async deny(userId: number, message: string) {
    //THIS SHOULD ALSO WRITE TO THE REQUESTS TABLE AND ADD THE MESSAGE TOGETHER WITH THE STEP
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      await sendInformationRequestEmail(
        user.email,
        message,
        process.env.VENDORS_PORTAL,
      );

      await this.userService.updateUser({
        where: { id: userId },
        data: {
          userStatus: UserStatus.REQUEST,
        },
      });
      return { status: 200, message: 'User status change to Request' };
    } catch (error) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
  }

  async ban(userId: number, message: string) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      await sendBanNotificationEmail(
        user.email,
        message,
        process.env.VENDORS_PORTAL,
      );

      await this.userService.updateUser({
        where: { id: userId },
        data: {
          userStatus: UserStatus.BANNED,
        },
      });
      return { status: 200, message: 'User banned' };
    } catch (error) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
  }

  generateHDWallet() {
    const hdWallet = HDNodeWallet.createRandom();
    const mnemonic = hdWallet.mnemonic?.phrase;
    const xpriv = hdWallet.extendedKey;
    const xpub = hdWallet.neuter().extendedKey;
    const address = hdWallet.address;

    console.log('Mnemonic:', mnemonic);
    console.log('xpriv:', xpriv);
    console.log('xpub:', xpub);
    console.log('Address:', address);

    return { mnemonic, xpriv, xpub, address };
  }

  generateEncrypted() {
    console.log('Encrypted XPRIV:', encryptWallet(process.env.WALLET_XPRIV, process.env.MASTER_KEY));
    console.log('Encrypted XPUB:', encryptWallet(process.env.WALLET_XPUB, process.env.MASTER_KEY));
  }
}
