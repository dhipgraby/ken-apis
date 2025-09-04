import { IsEmail, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*\d)(?=.*[A-Z])(?=.*[-._!"`'#%&,:;<>=@{}~$()*+/\\?[\]^|])/, {
    message:
      'Password must contain at least 1 upper case letter, 1 number, and 1 special character',
  })
  password: string;

  @MinLength(3)
  @MaxLength(15)
  username: string;
}
