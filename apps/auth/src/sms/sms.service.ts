import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from '../email/token.service';
import { SMSAPI } from 'smsapi';
import { EmailActions } from '../users/dto/reset-password.dto';

@Injectable()
export class SmsService {
    constructor(
        private readonly prisma: PrismaService,
        private tokenService: TokenService
    ) { }
    //GETTERS
    getVerificationTokenByUser = async (userId: number) => {
        try {
            const verificationToken =
                await this.prisma.phoneVerificationCode.findFirst({
                    where: { userId },
                });

            return verificationToken;
        } catch {
            return null;
        }
    };

    getVerificationTokenByToken = async (code: string) => {
        try {
            const currentToken = await this.prisma.phoneVerificationCode.findUnique({
                where: { code },
            });

            return currentToken;
        } catch {
            return null;
        }
    };

    verifySmsExpiration = async (
        lastVerificationSmsSent: Date,
        userId: number,
        phoneNumber: string,
        phoneDialCode: string,
    ) => {
        const currentTime: any = new Date();
        const expirationTime: any = new Date(lastVerificationSmsSent.getTime()); // Add 2 minutes to last sent time

        //TOKEN NOT JET EXPIRED
        if (currentTime < expirationTime) {
            const timeRemaining: any = Math.ceil(
                (expirationTime - currentTime) / 1000,
            ); // Convert milliseconds to seconds and round up

            let timeRemainingMessage;
            if (timeRemaining < 60) {
                timeRemainingMessage = `${timeRemaining} seconds`;
            } else {
                const timeRemainingMinutes = Math.floor(timeRemaining / 60); // Convert seconds to minutes and round down
                const remainingSeconds = timeRemaining % 60; // Remaining seconds after subtracting whole minutes
                timeRemainingMessage = `${timeRemainingMinutes} minute${timeRemainingMinutes > 1 ? 's' : ''
                    } ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
            }

            return {
                status: 204,
                message: `Please wait ${timeRemainingMessage} before sending another verification sms`,
            };
        } else {
            //GENERATE NEW TOKEN
            const verificationToken = await this.generateVerificationToken(userId);

            console.log('verificationToken', verificationToken.code);

            await this.sendVerification(userId, phoneNumber, phoneDialCode);
            return { status: 202, message: 'Verification sms sent to your phone.' };
        }
    };

    sendVerification = async (
        userId: number,
        phoneNumber: string,
        phoneDialCode: string,
    ) => {        
        //GENERATE NEW TOKEN
        const verificationToken = await this.generateVerificationToken(userId);
        
        try {
            await this.sendVerificationSms(
                userId,
                verificationToken.code,
                phoneNumber,
                phoneDialCode,
            );
            return { status: 202, message: 'Verification sms sent to your phone.', twofactorSms: true };
        } catch (error) {
            return {
                status: 400,
                message:
                    'Error sending verification sms, try again or contact support.',
            };
        }
    };

    async sendVerificationSms(
        userId: number,
        verificationToken: string,
        phoneNumber: string,
        phoneDialCode: string,
    ) {

        const smsapi = new SMSAPI(process.env.SMSAPI_KEY as string);
        try {
            //SMS CODE HERE      
            console.log(`sending 2fa sms to ${phoneDialCode}${phoneNumber}`);
            const result = await smsapi.sms.sendSms(`${phoneDialCode}${phoneNumber}`, `Ken Auth code from SMSAPI ${verificationToken}`);
            console.log(result);

            return true;
        } catch (error) {
            return {
                status: 400,
                message: `Error sending verification sms to ${phoneDialCode}${phoneNumber}, try again or contact support.`,
            };
        }
    }

    //GENERATE SMS| CODE IN DB
    generateVerificationToken = async (userId: number) => {
        const code = this.generateRandomToken();
        const expires = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes = 180,000 ms

        const existingToken = await this.getVerificationTokenByUser(userId);

        if (existingToken) {
            await this.prisma.phoneVerificationCode.delete({
                where: {
                    id: existingToken.id,
                },
            });
        }

        const verficationToken = await this.prisma.phoneVerificationCode.create({
            data: {
                userId,
                code,
                expires_at: expires,
            },
        });

        return verficationToken;
    };

    generateRandomToken() {
        const characters = '0123456789'; // Possible characters for the token
        const length = 6; // Length of the token
        let code = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            code += characters[randomIndex];
        }
        return code;
    }

    checkExpiration = async (lastVerificationSmsSent: Date) => {
        const currentTime: any = new Date();
        const expirationTime: any = new Date(lastVerificationSmsSent.getTime()); // Add 2 minutes to last sent time

        //TOKEN NOT JET EXPIRED
        if (currentTime < expirationTime) {
            const timeRemaining: any = Math.ceil(
                (expirationTime - currentTime) / 1000,
            ); // Convert milliseconds to seconds and round up

            let timeRemainingMessage;
            if (timeRemaining < 60) {
                timeRemainingMessage = `${timeRemaining} seconds`;
            } else {
                const timeRemainingMinutes = Math.floor(timeRemaining / 60); // Convert seconds to minutes and round down
                const remainingSeconds = timeRemaining % 60; // Remaining seconds after subtracting whole minutes
                timeRemainingMessage = `${timeRemainingMinutes} minute${timeRemainingMinutes > 1 ? 's' : ''
                    } ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
            }

            return {
                status: 202,
                message: `Please wait ${timeRemainingMessage} before sending another verification sms`,
            };
        } else {
            //TOKEN IS EXPIRED
            return { status: 400, message: 'Token is expired' };
        }
    };

    async verifyPhone(code: string, userEmail?: string) {

        try {

            const verificationCode =
                await this.getVerificationTokenByToken(code);

            if (!verificationCode) {
                return {
                    status: 400,
                    message: 'Invalid code.',
                };
            }

            const lastVerificationSmsSent = verificationCode.expires_at;

            const isExpired = await this.checkExpiration(
                lastVerificationSmsSent,
            );

            if (isExpired.status === 400) return isExpired;

            if (verificationCode.code !== code) {
                return {
                    status: 400,
                    message: 'Invalid code.',
                };
            } else {
                await this.prisma.phoneVerificationCode.delete({
                    where: {
                        code: code,
                        userId: verificationCode.userId,
                    },
                });

                if (userEmail) {
                    const tokenExist = await this.tokenService.getTwoFactorTokenByEmail(
                        userEmail,
                        EmailActions.TWO_FACTOR_LOGIN,
                    );
                    if (tokenExist) {
                        await this.prisma.twoFactorCode.delete({
                            where: {
                                id: tokenExist.id,
                            },
                        });
                    }
                }

                return {
                    status: 200,
                    message: 'Phone verification success!',
                };
            }
        } catch (error) {
            console.error('Error sending phone verification:', error);
            return {
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Error sending phone verification',
            };
        }
    }
}
