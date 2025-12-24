import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginService } from './auth.service';

@ApiTags('Root')
@Controller()
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @Get()
  @ApiOperation({ summary: 'Health / root endpoint' })
  getHello(): string {
    return this.loginService.getHello();
  }
}
