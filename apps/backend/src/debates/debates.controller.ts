import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/auth.types';
import { DebatesService } from './debates.service';
import { FilterBody } from '../personas/persona.dto';

export class CreateDebateDto extends FilterBody {
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4',{each:true}) messageIds?:string[];
  @IsString() @MinLength(1) @MaxLength(800) @Matches(/\S/) input!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(400) @ArrayUnique() @IsUUID('4', { each: true }) speakerIds?: string[];
}
export class RevisionDto { @IsInt() @Min(1) @Max(2147483646) revision!: number; }
export class DocumentDto extends RevisionDto {
  @IsOptional() @IsString() @MaxLength(10000) @Matches(/\S/) markdown?:string;
  @IsOptional() @IsBoolean() markdownEdited?:boolean;
  @IsOptional() @IsBoolean() researchReviewed?:boolean;
  @IsOptional() @IsString() @MaxLength(300) @Matches(/\S/) decisionGoal?:string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({each:true}) @MaxLength(500,{each:true}) constraints?:string[];
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({each:true}) @MaxLength(500,{each:true}) assumptions?:string[];
  @IsOptional() @IsObject() answerSchema?: import("./debate.types").AnswerSchema;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({each:true}) @MaxLength(500,{each:true}) facts?:string[];
  @IsOptional() @IsString() @MaxLength(2000) @Matches(/\S/) summary?: string;
  @IsString() @MaxLength(300) @Matches(/\S/) question!: string;
  @IsString() @MaxLength(300) @Matches(/\S/) proposition!: string;
  @IsString() @MaxLength(800) @Matches(/\S/) context!: string;
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) @Matches(/\S/, { each: true }) keyIssues!: string[];
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) @Matches(/\S/, { each: true }) supportingLogic!: string[];
  @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(500, { each: true }) @Matches(/\S/, { each: true }) opposingLogic!: string[];
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(100, { each: true }) evidenceMessageIds!: string[];
}
class ResearchDto extends RevisionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ArrayUnique() @IsString({each:true}) @MinLength(2,{each:true}) @MaxLength(150,{each:true}) @Matches(/\S/,{each:true}) queries!:string[];
}
class RestartDto { @IsIn(['document','opinions']) mode!: 'document'|'opinions'; }
class HistoryQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number; }
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('페르소나 논쟁') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller()
export class DebatesController {
  constructor(private readonly service: DebatesService) {}
  @Get('conversations/:id/persona-debates/facets') @ApiOperation({ summary: '페르소나 필터 선택지 조회' })
  facets(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) { return this.service.facets(user, id); }
  @Post('conversations/:id/persona-debates/preview') @HttpCode(200) @ApiOperation({ summary: '조건 적용 후 표본 크기 미리보기' })
  preview(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: FilterBody) { return this.service.preview(user, id, body.filters ?? {}); }
  @Post('conversations/:id/persona-debates') @HttpCode(202) @ApiOperation({ summary: '수정 가능한 논쟁 정리 문서 생성 (페르소나 분석은 별도 시작)' })
  create(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: CreateDebateDto) { return this.service.create(user, id, body.input, body.filters ?? {}, body.speakerIds ?? [],body.messageIds??[]); }
  @Get('conversations/:id/persona-debates/history') @ApiOperation({ summary: '대화별 분석 기록, 20개씩 페이지 조회' })
  history(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query() query: HistoryQuery) { return this.service.history(user, id, query.page ?? 1); }
  @Get('conversations/:id/persona-debates') @ApiOperation({ summary: '마지막 분석 복원' })
  async latest(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) { return { job: await this.service.latest(user, id) }; }
  @Get('persona-debates/:id') @ApiOperation({ summary: '분석 상태·진행률·결과 조회' })
  find(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) { return this.service.find(user, id); }
  @Patch('persona-debates/:id/document') @ApiOperation({ summary: '검토 중인 문서 수정 및 포함할 발언 선택' })
  document(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: DocumentDto) { return this.service.saveDocument(user, id, body); }
  @Post('persona-debates/:id/document/compose') @HttpCode(200) @ApiOperation({summary:'조건과 조사 결과를 마크다운으로 조합 (저장·모델 호출 없음)'})
  compose(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Body() body:DocumentDto){return this.service.composeDocument(user,id,body);}
  @Post('persona-debates/:id/research') @HttpCode(202) @ApiOperation({summary:'기존 문서를 보존한 새 조사 기록 생성; 검토 단계에서 대기'})
  research(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Body() body:ResearchDto){return this.service.researchDocument(user,id,body.revision,body.queries);}
  @Post('persona-debates/:id/restart') @HttpCode(202) @ApiOperation({summary:'실패 기록을 보존하고 기존 입력·필터로 새 분석 시작'})
  restart(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Body() body:RestartDto){return this.service.restart(user,id,body.mode);}
  @Post('persona-debates/:id/run') @HttpCode(202) @ApiOperation({ summary: '확인한 문서로 설정된 인원만큼 상세·JEV 분석 시작' })
  run(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: RevisionDto) { return this.service.start(user, id, body.revision); }
  @Post('persona-debates/:id/result') @HttpCode(200) @ApiOperation({ summary: '저장된 응답에 필터를 적용해 재집계 (모델 재호출 없음)' })
  result(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: FilterBody) { return this.service.result(user, id, body.filters ?? {}); }
}
