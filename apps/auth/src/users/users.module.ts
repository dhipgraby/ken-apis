import { Module } from '@nestjs/common';
import { UserService } from './users.service';
import { UsersController } from './users.controller';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from 'lib/common/database/prisma.service';
import { JwtStrategy } from 'lib/common/auth/jwt.strategy';
import { TokenService } from '../email/token.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_KEY,
      signOptions: { expiresIn: '20h' },
    }),
  ],
  controllers: [UsersController],
  providers: [
    UserService,
    TokenService,
    EmailService,
    SmsService,
    PrismaService,
    JwtStrategy,
  ],
})
export class UsersModule { }
