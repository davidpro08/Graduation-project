import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class UploadDto {
  @ApiProperty() @IsUUID('4') uploadId!: string;
  @ApiProperty({maxLength:80}) @Transform(({value}: {value:unknown}) => typeof value==='string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
}
export class ChatQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') messageId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') participantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({default:1}) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @ApiPropertyOptional({default:100}) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}
