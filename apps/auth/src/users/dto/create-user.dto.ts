import { IsEmail, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Test.1234' })
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*\d)(?=.*[A-Z])(?=.*[-._!"`'#%&,:;<>=@{}~$()*+\/\\?[\]^|])/, {
    message:
      'Password must contain at least 1 upper case letter, 1 number, and 1 special character',
  })
  password: string;

  @ApiProperty({ example: 'admin' })
  @MinLength(3)
  @MaxLength(15)
  username: string;
}
