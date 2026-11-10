import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsObject, ValidateIf, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import type { PersonaFilters } from './persona.types';

const OptionalField = () => ValidateIf((_object: unknown, value: unknown) => value !== undefined);

export class PersonaFiltersDto implements PersonaFilters {
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) ageGroup?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) sex?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) province?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) education?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) maritalStatus?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) familyType?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) occupation?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) district?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) bachelorsField?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) housingType?: string[];
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) militaryStatus?: string[];
}
export class FilterBody { @ApiPropertyOptional({ type: () => PersonaFiltersDto }) @OptionalField() @IsObject() @ValidateNested() @Type(() => PersonaFiltersDto) filters?: PersonaFiltersDto; }
export class FacetQueryDto {
  @ApiPropertyOptional({ type: [String] }) @OptionalField() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? [value] : value) @IsArray() @ArrayMaxSize(17) @ArrayUnique() @IsString({ each: true }) @MaxLength(200, { each: true }) province?: string[];
  @ApiPropertyOptional() @OptionalField() @IsString() @MaxLength(100) occupationSearch?: string;
  @ApiPropertyOptional({ default: 1 }) @OptionalField() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page = 1;
}
export class SearchPersonasDto extends FilterBody {
  @ApiPropertyOptional({ default: 1 }) @OptionalField() @IsInt() @Min(1) @Max(100000) page = 1;
  @ApiPropertyOptional({ default: 20 }) @OptionalField() @IsInt() @Min(1) @Max(50) pageSize = 20;
}
export class SamplePersonasDto extends FilterBody { @ApiPropertyOptional() @OptionalField() @IsString() @MinLength(1) @MaxLength(100) seed?: string; }
