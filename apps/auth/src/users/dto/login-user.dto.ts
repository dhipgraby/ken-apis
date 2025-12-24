import { MaxLength, MinLength, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
  @ApiProperty({
    description: 'Email or username',
    example: 'admin@example.com',
  })
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ example: 'Test.1234' })
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  code: number;

  @IsOptional()
  smsCode: string;
}

export class GoogleAuthDto {
  @ApiProperty({ example: 'ya29.a0AWY...google.id.token.value' })
  @MinLength(8)
  @IsNotEmpty()
  googleTokenId: string;
}
