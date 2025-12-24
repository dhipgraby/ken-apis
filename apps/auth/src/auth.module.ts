import { Module } from '@nestjs/common';
import { LoginController } from './auth.controller';
import { LoginService } from './auth.service';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [UsersModule, EmailModule],
  controllers: [LoginController],
  providers: [LoginService],
})
export class LoginModule {}
