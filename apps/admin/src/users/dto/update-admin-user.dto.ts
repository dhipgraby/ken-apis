import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: 'demo.user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'newusername' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Numeric role code', example: 0 })
  @IsOptional()
  @IsInt()
  role?: number;

  @ApiPropertyOptional({ description: 'Numeric user status code', example: 0 })
  @IsOptional()
  @IsInt()
  userStatus?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  email_verified?: boolean | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isTwoFactorEnabled?: boolean;

  // Flat userInfo fields for convenience
  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  lastName?: string;
}
