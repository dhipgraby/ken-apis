import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserStatus } from 'lib/common/types/user.types';
import { hash } from 'bcrypt';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from './token.service';
import {
  ConfirmResetPasswordDto,
  EmailActions,
} from '../users/dto/reset-password.dto';
import { UserService } from '../users/users.service';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly userService: UserService,
  ) {}
  //USER EMAIL VERIFICATION
  newVerification = async (token: string) => {
    return this.prisma.$transaction(async (transaction) => {
      const existingToken = await transaction.emailCode.findFirst({
        where: { code: token, action: EmailActions.EMAIL_VERIFICATION },
      });
      if (!existingToken) {
        throw new HttpException('Token does not exist!', HttpStatus.NOT_FOUND);
      }
      if (existingToken.expires_at <= new Date()) {
        throw new HttpException('Token has expired!', HttpStatus.GONE);
      }

      const existingUser = await transaction.user.findUnique({
        where: { email: existingToken.email },
      });
      if (!existingUser) {
        throw new HttpException('Email does not exist!', HttpStatus.NOT_FOUND);
      }
      if (existingUser.userStatus !== UserStatus.PROCESSING &&
          existingUser.userStatus !== UserStatus.VERIFIED) {
        throw new HttpException('Account cannot be verified', HttpStatus.FORBIDDEN);
      }

      // Competing consumers serialize on this row; the loser deletes zero rows.
      const consumed = await transaction.emailCode.deleteMany({
        where: {
          id: existingToken.id,
          code: token,
          action: EmailActions.EMAIL_VERIFICATION,
          email: existingUser.email,
        },
      });
      if (consumed.count !== 1) {
        throw new HttpException('Token does not exist!', HttpStatus.NOT_FOUND);
      }

      // Recheck the account at write time: a concurrent ban/email change must
      // not be overwritten. A failed guard also rolls back token consumption.
      const updated = await transaction.user.updateMany({
        where: {
          id: existingUser.id,
          email: existingToken.email,
          userStatus: existingUser.userStatus,
          email_verified: existingUser.email_verified,
        },
        data: {
          userStatus: UserStatus.VERIFIED,
          email_verified: existingUser.email_verified ?? new Date(),
        },
      });
      if (updated.count !== 1) {
        const currentUser = await transaction.user.findUnique({
          where: { id: existingUser.id },
        });
        if (!currentUser || currentUser.email !== existingToken.email) {
          throw new HttpException('Email does not exist!', HttpStatus.NOT_FOUND);
        }
        throw new HttpException('Account changed during verification', HttpStatus.FORBIDDEN);
      }

      return { status: 200, success: 'Email verified!' };
    });
  };

  passwordResetVerification = async (
    changePasswordDto: ConfirmResetPasswordDto,
  ) => {
    // Support both reset-password and first-time set-password tokens
    let existingToken = await this.tokenService.getVerificationTokenByToken(
      changePasswordDto.token,
      EmailActions.PASSWORD_RESET,
    );

    if (!existingToken) {
      existingToken = await this.tokenService.getVerificationTokenByToken(
        changePasswordDto.token,
        EmailActions.PASSWORD_SET as any,
      );
    }

    if (!existingToken) return { status: 404, error: 'Token does not exist!' };

    const hasExpired = new Date(existingToken.expires_at) < new Date();

    if (hasExpired) return { status: 404, error: 'Token has expired!' };

    const existingUser = await this.prisma.user.findFirst({
      where: { email: existingToken.email },
    });

    if (!existingUser) return { status: 404, error: 'Email does not exist!' };

    await this.prisma.emailCode.delete({
      where: { id: existingToken.id, action: existingToken.action as any },
    });

    const plainToHash = await hash(changePasswordDto.password, 10);

    await this.userService.updateUser({
      data: { password: plainToHash },
      where: { id: existingUser.id },
    });

    return { status: 200, success: 'Password changed successfully!' };
  };
}
