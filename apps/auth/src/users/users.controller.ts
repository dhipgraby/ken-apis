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
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto, GoogleAuthDto } from './dto/login-user.dto';
import {
  ResetPasswordDto,
  ConfirmResetPasswordDto,
} from './dto/reset-password.dto';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';

@ApiBearerAuth()
@ApiTags('Auth')
@Controller('auth')
export class UsersController {
  constructor(
    private readonly usersService: UserService,
    private readonly emailService: EmailService,
  ) { }

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiCreatedResponse({ description: 'User successfully created' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.signup(createUserDto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate user with email/username and password',
  })
  @ApiOkResponse({ description: 'Returns JWT access token and user data' })
  login(@Body() loginUserDto: LoginUserDto) {
    return this.usersService.login(loginUserDto);
  }

  @Post('google')
  @ApiOperation({ summary: 'Authenticate user with Google ID token' })
  @ApiOkResponse({ description: 'Returns JWT access token and user data' })
  googleAuth(@Body() googleAuthDto: GoogleAuthDto) {
    return this.usersService.googleAuth(googleAuthDto);
  }

  @Post('admin-login')
  @ApiOperation({ summary: 'Authenticate an admin user' })
  @ApiOkResponse({ description: 'Returns admin JWT access token' })
  adminLogin(@Body() loginUserDto: LoginUserDto) {
    return this.usersService.adminLogin(loginUserDto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({ description: 'Password reset email sent (if user exists)' })
  reset(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.usersService.resetPassword(resetPasswordDto);
  }

  @Post('verify-password-email')
  @ApiOperation({
    summary: 'Confirm a password reset with provided token/code',
  })
  @ApiOkResponse({ description: 'Password updated successfully' })
  verifyPasswordResetEmail(
    @Body() confirmResetPasswordDto?: ConfirmResetPasswordDto,
  ) {
    return this.emailService.passwordResetVerification(confirmResetPasswordDto);
  }

  @Get('verify')
  @ApiOperation({ summary: 'Verify user email with verification token' })
  @ApiOkResponse({ description: 'Email successfully verified' })
  verifyEmail(@Query('token') token?: string) {
    return this.emailService.newVerification(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ description: 'Returns the authenticated user profile' })
  findAll(@Request() req) {
    const user_id = req.user.id;
    return this.usersService.findOne({ id: Number(user_id) });
  }
}
