import { IsOptional, IsNumber, Max, IsString } from 'class-validator';

export class VendorsConfigDto {
  @IsNumber()
  @IsOptional()
  @Max(99.9)
  feeRate: number;

  @IsNumber()
  @IsOptional()
  @Max(99.9)
  businessFeeRate: number;

  @IsString()
  @IsOptional()
  keyWord: string;

  @IsString()
  @IsOptional()
  bankAccount?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bicSwift?: string;
}
