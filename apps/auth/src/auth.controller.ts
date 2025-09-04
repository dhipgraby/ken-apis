import { Controller, Get } from '@nestjs/common';
import { LoginService } from './auth.service';

@Controller()
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @Get()
  getHello(): string {
    return this.loginService.getHello();
  }
}
