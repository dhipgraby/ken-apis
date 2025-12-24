import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminService {
  constructor() {}

  getHello(): string {
    return 'Admin Api is status 200!';
  }
}
