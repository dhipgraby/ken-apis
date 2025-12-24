
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {

    constructor(private jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }
        try {
                        const secret = process.env.JWT_SECRET || process.env.JWT_KEY;
                        const payload: any = await this.jwtService.verifyAsync(token, { secret });
            request['user'] = payload;

            if (payload.role === undefined) {
              throw new ForbiddenException('Role claim missing');
            }
            if (payload.role !== 3) {
              throw new ForbiddenException('User admin access only');
            }

        } catch (e) {
            if (e instanceof ForbiddenException) throw e;
            throw new UnauthorizedException();
        }
        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
