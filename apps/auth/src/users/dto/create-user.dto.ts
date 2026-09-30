import { IsEmail, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@example.com', format: 'email', required: true })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Test.1234', format: 'password', writeOnly: true,
    required: true, minLength: 8, maxLength: 128,
  })
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*\d)(?=.*[A-Z])(?=.*[-._!"`'#%&,:;<>=@{}~$()*+\/\\?[\]^|])/, {
    message:
      'Password must contain at least 1 upper case letter, 1 number, and 1 special character',
  })
  password: string;

  @ApiProperty({ example: 'admin', required: true, minLength: 3, maxLength: 15 })
  @MinLength(3)
  @MaxLength(15)
  username: string;
}
