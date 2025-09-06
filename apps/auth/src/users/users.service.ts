import { HttpException } from '@nestjs/common/exceptions';
import { HttpStatus } from '@nestjs/common/enums';
import { Injectable } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { hash, compare } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from '../email/token.service';
import { sendVerificationEmail } from 'lib/mail/mail';
import { SmsService } from '../sms/sms.service';
import {
  ResetPasswordDto,
  EmailActions,
  EmailActionType,
} from './dto/reset-password.dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenService: TokenService,
    private smsService: SmsService,
  ) { }

  async signup(userObject: CreateUserDto) {
    const { password, email, username } = userObject;

    const existingUser = await this.findAll({
      where: {
        OR: [{ email: email }, { username: username }],
      },
    });

    if (existingUser.length) {
      throw new HttpException(
        'User with the same email or name already exists',
        HttpStatus.FORBIDDEN,
      );
    }

    const plainToHash = await hash(password, 10);
    userObject = { ...userObject, password: plainToHash };

    try {
      const verificationToken =
        await this.tokenService.generateVerificationToken(
          email,
          EmailActions.EMAIL_VERIFICATION,
        );


      // await sendVerificationEmail(
      //   email,
      //   verificationToken.code,
      //   EmailActions.EMAIL_VERIFICATION,
      // );

      const newUser = await this.prisma.user.create({
        data: userObject,
      });

      if (newUser) {
        return {
          status: 200,
          message: 'New user created',
        };
      }
    } catch (error) {
      console.log('Signup error: ', error);
      throw new HttpException(
        'Database error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }


  // async googleAuth(googleAuthDto: GoogleAuthDto) {
  //   const { googleTokenId } = googleAuthDto;


  // }

  async login(userLoginObject: LoginUserDto) {
    const { identifier, password, code, smsCode } = userLoginObject;

    const findUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!findUser) {
      return {
        message: 'User not found',
        status: 404,
      };
    }

    const isValidPassword = await compare(password, findUser.password);

    if (!isValidPassword) {
      console.log('invalid credentials');
      throw new HttpException('Invalid credentialss', HttpStatus.FORBIDDEN);
    }

    // if (findUser.email_verified === null) {
    //   return await this.handleUnverifiedEmail(
    //     findUser.email,
    //     EmailActions.EMAIL_VERIFICATION,
    //   );
    // }

    // if (findUser.isTwoFactorEnabled === true) {
    //   if (code) {
    //     const isValidCode = await this.handleTwoFactorCode(
    //       code,
    //       findUser.email,
    //       findUser.isTwoFactorSmsEnabled
    //     );
    //     if (isValidCode !== true) return isValidCode;
    //   } else {
    //     return await this.handleTwoFactorRequest(
    //       findUser.email,
    //       'vendors.keneth.dev',
    //     );
    //   }
    // }

    // if (findUser.isTwoFactorSmsEnabled === true) {
    //   if (smsCode) {
    //     const isValidSmsCode = await this.smsService.verifyPhone(smsCode, findUser.email);
    //     if (isValidSmsCode.status !== 200) return isValidSmsCode;
    //   } else {
    //     const configUser = await this.prisma.vendorsConfig.findUnique({
    //       where: { userId: findUser.id }
    //     })


    //     if (!configUser.phoneNumber || !configUser.phoneDialCode) {
    //       return {
    //         status: 400,
    //         message: 'Phone number or dial code not configured for SMS verification.',
    //       };
    //     }
    //     return await this.smsService.sendVerification(findUser.id, configUser.phoneNumber, configUser.phoneDialCode);
    //   }
    // }

    await this.prisma.user.update({
      where: { id: findUser.id },
      data: { last_login: new Date().toISOString() },
    });

    const token = this.generateJwtToken(findUser);
    const data = this.formatLoginResponse(findUser, token);

    return data;
  }

  async adminLogin(userLoginObject: LoginUserDto) {
    const { identifier, password, code, smsCode } = userLoginObject;

    const findUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!findUser) {
      return {
        message: 'User not found',
        status: 404,
      };
    }

    const isValidPassword = await compare(password, findUser.password);

    if (!isValidPassword) {
      console.log('invalid credentials');
      throw new HttpException('Invalid credentialss', HttpStatus.FORBIDDEN);
    }

    if (findUser.email_verified === null) {
      return await this.handleUnverifiedEmail(
        findUser.email,
        EmailActions.EMAIL_VERIFICATION,
      );
    }

    if (findUser.isTwoFactorEnabled === true) {
      if (code) {
        const isValidCode = await this.handleTwoFactorCode(
          code,
          findUser.email,
          findUser.isTwoFactorSmsEnabled
        );
        if (isValidCode !== true) return isValidCode;
      } else {
        return await this.handleTwoFactorRequest(
          findUser.email,
          'vendors.keneth.dev',
        );
      }
    }

    if (findUser.isTwoFactorSmsEnabled === true) {
      if (smsCode) {
        const isValidSmsCode = await this.smsService.verifyPhone(smsCode, findUser.email);
        if (isValidSmsCode.status !== 200) return isValidSmsCode;
      } else {
        // return await this.smsService.sendVerification(findUser.id, adminConfig.phoneNumber, adminConfig.phoneDialCode);
      }
    }

    await this.prisma.user.update({
      where: { id: findUser.id },
      data: { last_login: new Date().toISOString() },
    });

    const token = this.generateJwtToken(findUser);
    const data = this.formatLoginResponse(findUser, token);

    return data;
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email } = resetPasswordDto;
    const findUser = await this.findOne({ email });

    if (!findUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!findUser.email_verified) {
      return await this.handleUnverifiedEmail(
        email,
        EmailActions.EMAIL_VERIFICATION,
      );
    } else {
      return await this.handleUnverifiedEmail(
        email,
        EmailActions.PASSWORD_RESET,
      );
    }
  }

  private async handleUnverifiedEmail(email: string, action: EmailActionType) {
    const tokenExist = await this.tokenService.getVerificationTokenByEmail(
      email,
      action,
    );

    if (tokenExist) {
      const lastVerificationEmailSent = tokenExist.expires_at;
      return await this.tokenService.verifyEmailExpiration(
        lastVerificationEmailSent,
        email,
        action,
      );
    } else {
      const verificationToken = await this.tokenService.generateVerificationToken(email, action);
      await sendVerificationEmail(email, verificationToken.code, action);

      const message = {
        status: 202,
        message: 'Confirmation email sent',
      };
      return message;
    }
  }

  private async handleTwoFactorRequest(email: string, platform: string) {
    //CHECK IF THERE IS ALREADY A EMAIL CODE IN DB AND IS NOT EXPIRED
    const tokenExist = await this.tokenService.getTwoFactorTokenByEmail(
      email,
      EmailActions.TWO_FACTOR_LOGIN,
    );
    if (tokenExist) {
      const lastVerificationEmailSent = tokenExist.expires_at;
      const isTokenExpired =
        await this.tokenService.verifyEmailTwoFactorExpiration(
          lastVerificationEmailSent,
        );

      if (isTokenExpired.status === 400) {
        return await this.tokenService.sendTwoFactorEmail(
          email,
          EmailActions.TWO_FACTOR_LOGIN,
          platform,
        );
      } else {
        return isTokenExpired;
      }
    } else {
      return await this.tokenService.sendTwoFactorEmail(
        email,
        EmailActions.TWO_FACTOR_LOGIN,
        platform,
      );
    }
  }

  private async handleTwoFactorCode(code: number, email: string, sms2FA?: boolean) {
    //CHECK IF TOKEN EXIST
    const tokenExist = await this.tokenService.getTwoFactorTokenByEmail(
      email,
      EmailActions.TWO_FACTOR_LOGIN,
    );
    if (tokenExist) {
      const lastVerificationEmailSent = tokenExist.expires_at;
      const isTokenExpired =
        await this.tokenService.verifyEmailTwoFactorExpiration(
          lastVerificationEmailSent,
        );

      if (isTokenExpired.status === 400) {
        return {
          status: HttpStatus.FORBIDDEN,
          message: 'Token is expired',
        };
      }

      // IF EXIST AND IS NOT EXPIRED, CHECK IF CODE IS THE SAME
      if (tokenExist.code !== code) {
        return {
          status: HttpStatus.UNAUTHORIZED,
          message: 'Invalid token',
        };
      }

      if (!sms2FA) {
        await this.prisma.twoFactorCode.delete({
          where: {
            id: tokenExist.id,
          },
        });
      }

      return true;
    } else {
      // IF TOKEN DOES NOT EXIST, BUT USER IS SENDING CODE IN THE REQUEST
      return {
        status: HttpStatus.UNAUTHORIZED,
        message: 'Invalid 2FA token',
      };
    }
  }

  private generateJwtToken(user: any) {
    const payload = { username: user.username, id: user.id, rol: user.rol };
    return this.jwtService.sign(payload);
  }

  private formatLoginResponse(user: any, token: string) {
    return {
      user: {
        username: user.username,
        email: user.email,
      },
      status: 200,
      message: 'Login successful',
      token,
    };
  }

  async findOne(userWhereUniqueInput: Prisma.UserWhereUniqueInput) {
    const user = await this.prisma.user.findUnique({
      where: userWhereUniqueInput,
    });
    if (!user) throw new HttpException('USER NOT FOUND', HttpStatus.NOT_FOUND);
    return {
      name: user.username,
      email: user.email,
      email_verified: user.email_verified,
      rol: user.rol,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      userStatus: user.userStatus,
      status: 200,
    };
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    const { where, data } = params;
    return this.prisma.user.update({
      data,
      where,
    });
  }
}
