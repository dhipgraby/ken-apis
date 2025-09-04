import { Injectable } from '@nestjs/common';

@Injectable()
export class LoginService {
  getHello(): string {
    return 'Authentication Api is status 200!';
  }
}
