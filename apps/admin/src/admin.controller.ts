import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from 'lib/common/auth/admin-guard';

@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  getHello(): string {
    return this.adminService.getHello();
  }
}
