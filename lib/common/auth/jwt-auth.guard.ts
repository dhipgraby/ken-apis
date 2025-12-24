
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class JwtAuthGuard implements CanActivate {

    constructor(private jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            console.log('No token provided');

            throw new UnauthorizedException();
        }
        try {
            const secret = process.env.JWT_SECRET || process.env.JWT_KEY;
            if (!secret) {
                console.log('JWT secret is not configured (JWT_SECRET/JWT_KEY missing)');
                throw new UnauthorizedException();
            }
            const payload = await this.jwtService.verifyAsync(
                token,
                {
                    secret
                }
            ); 

            console.log('Payload', { payload }); 
            // 💡 We're assigning the payload to the request object here
            // so that we can access it in our route handlers
            request['user'] = payload;
        } catch (e: any) {
            console.log('Invalid token', e?.message || e);
            throw new UnauthorizedException();
        }
        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
