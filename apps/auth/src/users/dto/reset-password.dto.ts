import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Match } from './match.decorator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'demo.user@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export enum EmailActions {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'reset_password',
  PASSWORD_SET = 'set_password',
  TWO_FACTOR_LOGIN = 'twofactor_login',
}

// Define a type for the enum values
export type EmailActionType =
  | EmailActions.EMAIL_VERIFICATION
  | EmailActions.PASSWORD_RESET
  | EmailActions.PASSWORD_SET
  | EmailActions.TWO_FACTOR_LOGIN;

export class ConfirmResetPasswordDto {
  @ApiProperty({ example: 'reset-token-or-email-code-123' })
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'NewStr0ngPass!2025' })
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*\d)(?=.*[A-Z])(?=.*[-._!"`'#%&,:;<>=@{}~$()*+\/\\?[\]^|])/, {
    message:
      'Password must contain at least 1 upper case letter, 1 number, and 1 special character',
  })
  password: string;

  @ApiProperty({ example: 'NewStr0ngPass!2025' })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @Match('password', { message: 'Password confirm does not match password' })
  confirmPassword: string;
}
