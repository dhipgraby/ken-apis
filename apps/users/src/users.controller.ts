import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';
import { UpdateUserProfileDto, ChangePasswordDto } from './dto/users.dto';
import { Request } from 'express';

@ApiBearerAuth()
@ApiTags('User Profile')
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getHello(): string {
    return this.usersService.getHello();
  }

  @UseGuards(JwtAuthGuard)
  @Get('/me')
  async me(@Req() req: Request) {
    const current = req['user'] as any; // set by JwtAuthGuard
    return this.usersService.getProfile(current.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/profile')
  async updateProfile(@Req() req: Request, @Body() dto: UpdateUserProfileDto) {
    const current = req['user'] as any;
    return this.usersService.updateProfile(current.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('/change-password')
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const current = req['user'] as any;
    return this.usersService.changePassword(current.id, dto.newPassword);
  }

  //Add send support email endpoint here
}
