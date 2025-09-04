import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
} from 'class-validator';

export class AdminConfigDto {
  @IsEmail()
  email: string;

  @IsNumber()
  feeRate: number;

  @IsNumber()
  @IsOptional()
  colateralRate: number;

  @IsString()
  bankAccount: string;

  @IsString()
  bicSwift: string;

  @IsString()
  bankName: string;

  @IsString()
  keyWord: string;

  @IsString()
  @IsOptional()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  phoneDialCode: string;

  @IsBoolean()
  @IsOptional()
  isTwoFactorEnabled: boolean;

  @IsBoolean()
  @IsOptional()
  isTwoFactorSmsEnabled: boolean;
}

export class EditVendorsConfigDto {
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @IsString()
  keyWord: string;

  @IsString()
  bankAccount: string;
}
