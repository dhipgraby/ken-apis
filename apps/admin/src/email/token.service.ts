import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationEmail } from 'lib/mail/mail';
import { EmailActionType, EmailActions } from '../users/dto/reset-password.dto';
import { SIGNUP_EMAIL_EXPIRATION } from 'lib/mail/constants';

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  //GENERATE EMAIL CODE IN DB
  generateVerificationToken = async (email: string, action: string) => {
    const token = uuidv4();
    const expires = new Date(new Date().getTime() + SIGNUP_EMAIL_EXPIRATION); // One hour expiration

    // Ensure we don't violate a unique constraint on `email` by reusing the same row
    const verificationToken = await this.prisma.emailCode.upsert({
      where: { email },
      update: { code: token, expires_at: expires, action },
      create: { email, code: token, expires_at: expires, action },
    });

    return verificationToken;
  };

  generatePasswordResetToken = async (email: string) => {
    const token = uuidv4();
    const expires = new Date(new Date().getTime() + 5 * 60 * 1000); // 5 minutes expiration

    const passwordResetToken = await this.prisma.emailCode.upsert({
      where: { email },
      update: {
        code: token,
        expires_at: expires,
        action: EmailActions.PASSWORD_RESET,
      },
      create: {
        email,
        code: token,
        expires_at: expires,
        action: EmailActions.PASSWORD_RESET,
      },
    });

    return passwordResetToken;
  };

  generateTwoFactorToken = async (email: string, action: EmailActionType) => {
    const token = this.generateRandomToken();
    const expires = new Date(new Date().getTime() + 5 * 60 * 1000); //1 minute expiration

    const existingToken = await this.getTwoFactorTokenByEmail(email, action);

    if (existingToken) {
      await this.prisma.twoFactorCode.delete({
        where: {
          id: existingToken.id,
        },
      });
    }

    const twoFactorCode = await this.prisma.twoFactorCode.create({
      data: {
        email,
        code: token,
        expires_at: expires,
        action: action,
      },
    });

    return twoFactorCode;
  };

  generateRandomToken() {
    const characters = '0123456789'; // Possible characters for the token
    const length = 6; // Length of the token
    let token = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      token += characters[randomIndex];
    }
    return Number(token);
  }
  //GETTERS
  getVerificationTokenByEmail = async (email: string, action: string) => {
    try {
      const verificationToken = await this.prisma.emailCode.findFirst({
        where: { email, action },
      });

      return verificationToken;
    } catch {
      return null;
    }
  };

  getTwoFactorTokenByEmail = async (email: string, action: EmailActionType) => {
    try {
      const verificationToken = await this.prisma.twoFactorCode.findFirst({
        where: { email, action },
      });

      return verificationToken;
    } catch {
      return null;
    }
  };

  getTwoFactorTokenByToken = async (code: number, action: EmailActionType) => {
    try {
      const currentToken = await this.prisma.twoFactorCode.findFirst({
        where: { code, action },
      });

      return currentToken;
    } catch {
      return null;
    }
  };

  getVerificationTokenByToken = async (
    code: string,
    action: EmailActionType,
  ) => {
    try {
      const currentToken = await this.prisma.emailCode.findUnique({
        where: { code, action },
      });

      return currentToken;
    } catch {
      return null;
    }
  };

  verifyEmailExpiration = async (
    lastVerificationEmailSent: Date,
    email: string,
    action: EmailActionType,
  ) => {
    const currentTime: any = new Date();
    const expirationTime: any = new Date(lastVerificationEmailSent.getTime()); // Add 1 minute to last sent time

    if (currentTime < expirationTime) {
      // EXPIRED TOKEN
      const timeRemaining: any = Math.ceil(
        (expirationTime - currentTime) / 1000,
      ); // Convert milliseconds to seconds and round up

      let timeRemainingMessage;
      if (timeRemaining < 60) {
        timeRemainingMessage = `${timeRemaining} seconds`;
      } else {
        const timeRemainingMinutes = Math.floor(timeRemaining / 60); // Convert seconds to minutes and round down
        const remainingSeconds = timeRemaining % 60; // Remaining seconds after subtracting whole minutes
        timeRemainingMessage = `${timeRemainingMinutes} minute${
          timeRemainingMinutes > 1 ? 's' : ''
        } ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
      }

      return {
        status: HttpStatus.PARTIAL_CONTENT,
        message: `Check your email inbox for the verification link or wait ${timeRemainingMessage} before sending another verification email`,
      };
    } else {
      //GENERATE NEW TOKEN
      const verificationToken = await this.generateVerificationToken(
        email,
        action,
      );

      await sendVerificationEmail(email, verificationToken.code, action);

      const response = { status: 202, message: 'Confirmation email sent' };
      return response;
    }
  };

  verifyEmailTwoFactorExpiration = async (lastVerificationEmailSent: Date) => {
    const currentTime: any = new Date();
    const expirationTime: any = new Date(
      lastVerificationEmailSent.getTime() + 1 * 60 * 1000,
    ); // Adding 1 minute to the last sent time

    if (currentTime < expirationTime) {
      // Token is not expired
      const timeRemaining = Math.ceil((expirationTime - currentTime) / 1000);

      let timeRemainingMessage;
      if (timeRemaining < 60) {
        timeRemainingMessage = `${timeRemaining} second${
          timeRemaining !== 1 ? 's' : ''
        }`;
      } else {
        const timeRemainingMinutes = Math.floor(timeRemaining / 60); // Convert seconds to minutes and round down
        const remainingSeconds = timeRemaining % 60; // Remaining seconds after subtracting whole minutes
        timeRemainingMessage = `${timeRemainingMinutes} minute${
          timeRemainingMinutes !== 1 ? 's' : ''
        } ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
      }

      return {
        status: 200,
        message: `Email verification token is still valid. Please wait ${timeRemainingMessage} before sending another verification email.`,
        twofactor: true,
      };
    } else {
      // Token has expired
      return {
        status: 400,
        message:
          'Email verification token has expired. Please request a new verification email.',
      };
    }
  };

  // sendTwoFactorEmail = async (
  //   email: string,
  //   action: EmailActionType,
  //   platform: string,
  // ) => {
  //   //GENERATE NEW TOKEN
  //   const verificationToken = await this.generateTwoFactorToken(email, action);
  //   await sendTwoFactorTokenEmail(email, verificationToken.code, platform);
  //   return { status: 200, message: '2FA email sent!', twofactor: true };
  // };
}
