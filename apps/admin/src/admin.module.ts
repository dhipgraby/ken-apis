import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from 'lib/common/auth/jwt.strategy';
import { AdminController } from './admin.controller';
import { UsersController } from './users/users.controller';
import { PrismaService } from 'lib/common/database/prisma.service';
import { TokenService } from './email/token.service';
import { AdminService } from './admin.service';
import { UsersModule } from './users/users.module';
import { UsersService as internalUsersService } from './users/users.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '20h' },
    }),
    UsersModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AdminController, UsersController],
  providers: [
    AdminService,
    PrismaService,
    JwtStrategy,
    TokenService,
    internalUsersService,
  ],
})
export class AdminModule { }
