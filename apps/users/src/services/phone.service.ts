import { HttpException } from '@nestjs/common/exceptions';
import { HttpStatus } from '@nestjs/common/enums';
import { Injectable } from '@nestjs/common';

import { PrismaService } from 'lib/common/database/prisma.service';
import { SmsService } from './sms.service';

@Injectable()
export class PhoneService {
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) { }

  async sendPhoneVerification({
    userId,
    phoneNumber,
    phoneDialCode,
  }: {
    userId: number;
    phoneNumber: string;
    phoneDialCode: string;
  }): Promise<any> {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!existingUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // const kycProfile = await this.kycService.getIndividualProfile(userId);

      // if (!kycProfile) {
      //   console.log('creating individual kyc profile');
      //   console.log('phoneNumber', phoneNumber);
      //   console.log('phoneDialCode', phoneDialCode);

      //   await this.kycService.createIndividualProfile(
      //     userId,
      //     phoneNumber,
      //     phoneDialCode,
      //   );
      //   return await this.sendVerificationCode(
      //     userId,
      //     phoneNumber,
      //     phoneDialCode,
      //   );
      // }

      // if (
      //   kycProfile.isPhoneVerified &&
      //   kycProfile.phoneDialCode === phoneDialCode &&
      //   kycProfile.phoneNumber === phoneNumber
      // ) {
      //   if (kycProfile.lastStep < FormStages.PERSONAL_INFO) {
      //     await this.prisma.individualKyc.update({
      //       where: { userId },
      //       data: {
      //         lastStep: FormStages.PERSONAL_INFO,
      //       },
      //     });
      //   }

      //   return {
      //     status: HttpStatus.FOUND,
      //     message: 'This phone number is already verified',
      //   };
      // }

      const verificationCode = await this.smsService.getVerificationTokenByUser(
        userId,
      );

      if (!verificationCode) {
        return await this.sendVerificationCode(
          userId,
          phoneNumber,
          phoneDialCode,
        );
      }

      const lastVerificationSmsSent = verificationCode.expires_at;
      return await this.smsService.verifySmsExpiration(
        lastVerificationSmsSent,
        userId,
        phoneNumber,
        phoneDialCode,
      );
    } catch (error) {
      console.error('Error sending phone verification:', error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error sending phone verification',
      };
    }
  }

  async verifyPhone({ userId, code }: { userId: number; code: string }) {

    // await this.prisma.individualKyc.update({
    //   where: { userId },
    //   data: {
    //     isPhoneVerified: true,
    //     lastStep: FormStages.PERSONAL_INFO,
    //   },
    // });

    // return true;

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!existingUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // const kycProfile = await this.kycService.getIndividualProfile(userId);

      // if (!kycProfile) {
      //   throw new HttpException('User profile not found', HttpStatus.NOT_FOUND);
      // }

      // if (kycProfile.isPhoneVerified) {
      //   return {
      //     status: 200,
      //     message: 'This phone number is already verified',
      //   };
      // }

      const verificationCode =
        await this.smsService.getVerificationTokenByToken(code);

      if (!verificationCode) {
        return {
          status: 400,
          message: 'Invalid code.',
        };
      }

      const lastVerificationSmsSent = verificationCode.expires_at;

      const isExpired = await this.smsService.checkExpiration(
        lastVerificationSmsSent,
      );

      if (isExpired.status !== 202) return isExpired;

      // if (verificationCode.code !== code) {
      //   return {
      //     status: 400,
      //     message: 'Invalid code.',
      //   };
      // } else {
      //   await this.prisma.individualKyc.update({
      //     where: { userId },
      //     data: {
      //       isPhoneVerified: true,
      //       lastStep: FormStages.PERSONAL_INFO,
      //     },
      //   });

      //   await this.prisma.phoneVerificationCode.delete({
      //     where: {
      //       code: code,
      //     },
      //   });

      //   return {
      //     status: 200,
      //     message: 'Phone verification success!',
      //   };
      // }
    } catch (error) {
      console.error('Error sending phone verification:', error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error sending phone verification',
      };
    }
  }

  private async sendVerificationCode(
    userId: number,
    phoneNumber: string,
    phoneDialCode: string,
  ): Promise<any> {
    try {
      return await this.smsService.sendVerification(
        userId,
        phoneNumber,
        phoneDialCode,
      );
    } catch (error) {
      console.error('Error sending verification code:', error);
      throw new HttpException(
        'Error sending verification code, try again or contact support.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
