import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'lib/common/auth/jwt-auth.guard';
import { SupportRequestDto } from './dto/support-request.dto';
import { SupportService } from './support.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  async send(@Req() req: any, @Body() dto: SupportRequestDto) {
    const userId = Number(req?.user?.id);
    return this.supportService.sendSupportEmail(userId, dto);
  }
}
