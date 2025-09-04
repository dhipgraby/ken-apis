import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsString,
} from 'class-validator';
import { Match } from './match.decorator';

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export enum EmailActions {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'reset_password',
  TWO_FACTOR_LOGIN = 'twofactor_login',
}

// Define a type for the enum values
export type EmailActionType =
  | EmailActions.EMAIL_VERIFICATION
  | EmailActions.PASSWORD_RESET
  | EmailActions.TWO_FACTOR_LOGIN;

export class ConfirmResetPasswordDto {
  @IsNotEmpty()
  token: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*\d)(?=.*[A-Z])(?=.*[-._!"`'#%&,:;<>=@{}~$()*+/\\?[\]^|])/, {
    message:
      'Password must contain at least 1 upper case letter, 1 number, and 1 special character',
  })
  password: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @Match('password', { message: 'Password confirm does not match password' })
  confirmPassword: string;
}
