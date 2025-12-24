import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { hash } from 'bcrypt';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Users Api is status 200!';
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userInfo: true },
    });
    if (!user) throw new HttpException('USER NOT FOUND', HttpStatus.NOT_FOUND);
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.userInfo?.first_name ?? null,
      last_name: user.userInfo?.last_name ?? null,
      created_at: user.created_at,
      last_modified: user.last_modified,
    };
  }

  async updateProfile(
    userId: number,
    data: {
      username?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    },
  ) {
    // Update User core fields
    const core: Prisma.UserUpdateInput = {};
    if (data.username !== undefined) core.username = data.username;
    if (data.email !== undefined) core.email = data.email;

    const tx = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(core).length) {
        await tx.user.update({ where: { id: userId }, data: core });
      }
      if (data.first_name !== undefined || data.last_name !== undefined) {
        const existing = await tx.userInfo.findUnique({ where: { userId } });
        if (existing) {
          await tx.userInfo.update({
            where: { userId },
            data: {
              first_name: data.first_name ?? existing.first_name,
              last_name: data.last_name ?? existing.last_name,
            },
          });
        } else {
          await tx.userInfo.create({
            data: {
              userId,
              first_name: data.first_name ?? '',
              last_name: data.last_name ?? '',
            },
          });
        }
      }
      return true;
    });
    return { status: 200, message: 'Profile updated' };
  }

  async changePassword(userId: number, newPassword: string) {
    const hashed = await hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { status: 200, message: 'Password changed' };
  }
}
