import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Prisma } from '@prisma/client';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from 'lib/common/auth/admin-guard';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminChangePasswordDto } from './dto/change-password.dto';

@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('all')
  async getUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('userId') userId?: number,
    @Query('username') username?: string,
    @Query('email') email?: string,
    @Query('userStatus') userStatus?: number,
    @Query('role') role?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('orderBy') orderBy?: 'desc' | 'asc',
  ) {
    const filters: Prisma.UserWhereInput = {};

    if (userId) {
      filters.id = Number(userId);
    }
    if (username) {
      filters.username = { contains: username };
    }
    if (email) {
      filters.email = { contains: email };
    }
    if (userStatus) {
      filters.userStatus = Number(userStatus);
    }
    if (role) {
      filters.role = Number(role);
    }
    if (startDate || endDate) {
      filters.created_at = {};
      if (startDate) {
        filters.created_at.gte = new Date(startDate).toISOString();
      }
      if (endDate) {
        filters.created_at.lte = new Date(endDate).toISOString();
      }
    }

    return this.usersService.getUsers(
      Number(page),
      Number(limit),
      filters,
      orderBy,
    );
  }

  @Get('get/:id')
  getSingle(@Param('id') userId: number) {
    return this.usersService.getSingle(Number(userId));
  }

  //USER APPROVALS
  @Post('approve/:id')
  approveUser(@Param('id') userId: number) {
    return this.usersService.approve(Number(userId));
  }

  @Post('deny/:id/:message')
  denyUser(@Param('id') userId: number, @Param('message') message: string) {
    return this.usersService.deny(Number(userId), message);
  }

  @Post('ban/:id/:message')
  banUser(@Param('id') userId: number, @Param('message') message: string) {
    return this.usersService.ban(Number(userId), message);
  }

  @Post('create')
  @ApiOperation({
    summary:
      'Admin: Create a standalone user (not assigned to any organization)',
  })
  createUser(@Body() dto: CreateAdminUserDto) {
    return this.usersService.createAdminUser(dto);
  }

  // Admin: Update a user's profile/details
  @Patch(':id')
  @ApiOperation({ summary: 'Admin: Update user profile/details' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.usersService.updateAdminUser(+id, dto);
  }

  // Admin: Change a user's password
  @Patch(':id/password')
  @ApiOperation({ summary: 'Admin: Change user password' })
  changePassword(@Param('id') id: string, @Body() dto: AdminChangePasswordDto) {
    return this.usersService.changePassword(+id, dto.password);
  }

  @Post(':id/resend-set-password')
  @ApiOperation({ summary: 'Admin: Resend set-password email to a user' })
  resendSetPassword(@Param('id') id: string) {
    return this.usersService.resendSetPasswordEmail(+id);
  }
}
