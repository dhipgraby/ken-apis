import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { SupportController } from './support/support.controller';
import { SupportService } from './support/support.service';
import { UserService as AuthService } from 'apps/auth/src/users/users.service';
import { TokenService } from 'apps/auth/src/email/token.service';
import { PrismaService } from 'lib/common/database/prisma.service';

@Module({
  controllers: [
    UsersController,
    SupportController,
  ],
  providers: [
    UsersService,
    SupportService,
    AuthService,
    TokenService,
    PrismaService,
    // JwtService is automatically provided by JwtModule
  ],
  imports: [
    JwtModule.register({}), // Add your config here if needed
  ],
})
export class UsersModule { }
