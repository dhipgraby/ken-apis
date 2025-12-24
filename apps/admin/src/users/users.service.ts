import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { UserStatus } from 'lib/common/types/user.types';
import { Prisma } from '@prisma/client';
import { VendorsConfigDto } from './dto/settings.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { hash } from 'bcrypt';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { sendVerificationEmail } from 'lib/mail/mail';
import { TokenService } from '../email/token.service';
import { EmailActions } from '../users/dto/reset-password.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
  ) {}

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
          role: true,
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
          role: true,
          userStatus: true,
          last_login: true,
          last_modified: true,
          created_at: true,
          isTwoFactorEnabled: true,
        },
      });

      if (!user)
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);

      return user;
    } catch (error) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
  }

  async createAdminUser(dto: CreateAdminUserDto) {
    // Ensure uniqueness
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (exists) {
      throw new HttpException(
        'User with same email or username exists',
        HttpStatus.CONFLICT,
      );
    }
    const passwordHash = await hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: passwordHash,
        role: 0,
        userInfo:
          dto.firstName || dto.lastName
            ? {
                create: {
                  first_name: dto.firstName,
                  last_name: dto.lastName,
                },
              }
            : undefined,
      },
    });
    return { status: 200, message: 'User created', id: user.id };
  }

  async updateAdminUser(userId: number, dto: UpdateAdminUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userInfo: true },
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    // Ensure unique email/username if changing
    if (dto.email && dto.email !== user.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken)
        throw new HttpException('Email already in use', HttpStatus.CONFLICT);
    }
    if (dto.username && dto.username !== user.username) {
      const usernameTaken = await this.prisma.user.findFirst({
        where: { username: dto.username },
      });
      if (usernameTaken)
        throw new HttpException('Username already in use', HttpStatus.CONFLICT);
    }

    const data: any = {};
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.userStatus !== undefined) data.userStatus = dto.userStatus;
    if (dto.email_verified !== undefined)
      data.email_verified = dto.email_verified as any;
    if (dto.isTwoFactorEnabled !== undefined)
      data.isTwoFactorEnabled = dto.isTwoFactorEnabled;
    data.last_modified = new Date().toISOString();

    // Handle userInfo upsert when names provided
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      if (user.userInfo) {
        data.userInfo = {
          update: {
            first_name: dto.firstName ?? user.userInfo.first_name,
            last_name: dto.lastName ?? user.userInfo.last_name,
          },
        };
      } else {
        data.userInfo = {
          create: {
            first_name: dto.firstName ?? null,
            last_name: dto.lastName ?? null,
          },
        };
      }
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return { status: 200, message: 'User updated' };
  }

  async changePassword(userId: number, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const passwordHash = await hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash, last_modified: new Date().toISOString() },
    });
    return { status: 200, message: 'Password changed' };
  }

  async resendSetPasswordEmail(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    const verificationToken = await this.tokenService.generateVerificationToken(
      user.email,
      EmailActions.PASSWORD_SET,
    );
    try {
      // reuse existing mail helper to send set-password email
      await sendVerificationEmail(
        user.email,
        verificationToken.code,
        EmailActions.PASSWORD_SET,
      );
      return { status: 202, message: 'Set password email sent' };
    } catch (err) {
      // If email fails to send, remove the code so we don't leave a stale row that blocks future sends
      await this.prisma.emailCode
        .deleteMany({ where: { email: user.email } })
        .catch(() => {});
      return { status: 500, message: 'Failed to send set-password email' };
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
      //UPDATING STATE TO VERIFIED
      await this.prisma.user.update({
        where: { id: userId },
        data: { userStatus: UserStatus.VERIFIED },
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

      await this.prisma.user.update({
        where: { id: userId },
        data: { userStatus: UserStatus.REQUEST },
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

      await this.prisma.user.update({
        where: { id: userId },
        data: { userStatus: UserStatus.BANNED },
      });
      return { status: 200, message: 'User banned' };
    } catch (error) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
  }
}
