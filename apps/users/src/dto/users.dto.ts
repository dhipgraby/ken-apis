import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ example: 'jane.doe' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  last_name?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({ example: 'newStrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
