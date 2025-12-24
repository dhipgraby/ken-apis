import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SupportRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsIn(['bug', 'feature', 'enhancement', 'question'])
  type!: 'bug' | 'feature' | 'enhancement' | 'question';

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description!: string;
}
