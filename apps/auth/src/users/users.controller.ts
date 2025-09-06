import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { UserService } from './users.service';
import { EmailService } from '../email/email.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { GoogleAuthDto, googleAuthDto, LoginUserDto } from './dto/login-user.dto';
import {
  ResetPasswordDto,
  ConfirmResetPasswordDto,
} from './dto/reset-password.dto';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';

@ApiBearerAuth()
@ApiTags('auth')
@Controller('auth')
export class UsersController {
  constructor(
    private readonly usersService: UserService,
    private readonly emailService: EmailService,
  ) { }

  @Post('signup')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.signup(createUserDto);
  }

  @Post('login')
  login(@Body() loginUserDto: LoginUserDto) {
    return this.usersService.login(loginUserDto);
  }

  // @Post('google')
  // googleAuth(@Body() googleAuthDto: GoogleAuthDto) {
  //   return this.usersService.googleAuth(googleAuthDto);
  // }

  @Post('admin-login')
  adminLogin(@Body() loginUserDto: LoginUserDto) {
    return this.usersService.adminLogin(loginUserDto);
  }

  @Post('reset-password')
  reset(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.usersService.resetPassword(resetPasswordDto);
  }

  @Post('verify-password-email')
  verifyPasswordResetEmail(
    @Body() confirmResetPasswordDto?: ConfirmResetPasswordDto,
  ) {
    return this.emailService.passwordResetVerification(confirmResetPasswordDto);
  }

  @Get('verify')
  verifyEmail(@Query('token') token?: string) {
    return this.emailService.newVerification(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user')
  findAll(@Request() req) {
    const user_id = req.user.id;
    return this.usersService.findOne({ id: Number(user_id) });
  }
}
