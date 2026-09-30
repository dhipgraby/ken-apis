import {
    CanActivate, ExecutionContext, Injectable,
    UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { UserStatus } from '../types/user.types';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
    constructor(private jwtService: JwtService, private prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        const secret = process.env.JWT_SECRET || process.env.JWT_KEY;
        if (!token || !secret) throw new UnauthorizedException();

        let payload: { id?: unknown };
        try {
            payload = await this.jwtService.verifyAsync(token, { secret });
        } catch {
            throw new UnauthorizedException();
        }
        const id = payload?.id;
        if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
            throw new UnauthorizedException();
        }
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { id: true, username: true, role: true, userStatus: true },
        });
        if (!user) throw new UnauthorizedException();
        if (user.userStatus !== UserStatus.VERIFIED) throw new ForbiddenException();
        if (user.role !== 3) throw new ForbiddenException('User admin access only');
        request['user'] = { id: user.id, username: user.username, role: user.role };
        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
