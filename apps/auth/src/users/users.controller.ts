import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserService } from './users.service';
import { EmailService } from '../email/email.service';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiGoneResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto, GoogleAuthDto } from './dto/login-user.dto';
import {
  ResetPasswordDto,
  ConfirmResetPasswordDto,
} from './dto/reset-password.dto';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';

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
  @ApiBadRequestResponse({ description: 'Invalid registration data' })
  @ApiForbiddenResponse({ description: 'Registration is not permitted' })
  @ApiServiceUnavailableResponse({ description: 'Verification email delivery unavailable' })
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
  @ApiQuery({ name: 'token', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ description: 'Email successfully verified' })
  @ApiBadRequestResponse({ description: 'Missing or invalid verification token' })
  @ApiForbiddenResponse({ description: 'Verification is not permitted' })
  @ApiNotFoundResponse({ description: 'Verification token or user not found' })
  @ApiGoneResponse({ description: 'Verification token expired' })
  verifyEmail(@Query('token', new ParseUUIDPipe({ version: '4' })) token: string) {
    return this.emailService.newVerification(token);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('user')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ description: 'Returns the authenticated user profile' })
  findAll(@Request() req) {
    const user_id = req.user.id;
    return this.usersService.findOne({ id: Number(user_id) });
  }
}
