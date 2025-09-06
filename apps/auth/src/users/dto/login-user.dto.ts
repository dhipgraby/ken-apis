import { MaxLength, MinLength, IsNotEmpty, IsOptional } from 'class-validator';

export class LoginUserDto {
  @IsNotEmpty()
  identifier: string;

  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  code: number;

  @IsOptional()
  smsCode: string;
}


export class GoogleAuthDto {
  @MinLength(8)
  @IsNotEmpty()
  googleTokenId: string;
}
