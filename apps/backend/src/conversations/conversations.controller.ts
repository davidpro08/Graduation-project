import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/auth.types';
import { ChatQuery, UploadDto } from './conversation.dto';
import { ConversationsService } from './conversations.service';
function validate(query: ChatQuery) {
  for (const date of [query.from,query.to]) {
    if (!date) continue;
    const parsed=new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) throw new BadRequestException('올바른 날짜를 선택해 주세요.');
  }
  if (query.from && query.to && query.from>query.to) throw new BadRequestException('종료일은 시작일 이후로 선택해 주세요.');
  return query;
}
@ApiTags('conversations') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller('conversations')
export class ConversationsController {
  constructor(private readonly chats: ConversationsService) {}
  @Get() @ApiOperation({summary:'본인 대화 목록 · 페이지당 20개'})
  list(@CurrentUser() user: AuthUser,@Query() query: ChatQuery) { return this.chats.list(user,query.page ?? 1,query.search); }
  @Post() @ApiConsumes('multipart/form-data') @ApiOperation({summary:'카카오톡 TXT 업로드·파싱·원본과 구조화 데이터 저장'})
  @ApiBody({schema:{type:'object',required:['uploadId','title','file'],properties:{uploadId:{type:'string',format:'uuid'},title:{type:'string',maxLength:80},file:{type:'string',format:'binary'}}}})
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10485760,files:1,fields:2}}))
  upload(@CurrentUser() user: AuthUser,@Body() body: UploadDto,@UploadedFile() file?: Express.Multer.File) { return this.chats.upload(user,body.uploadId,body.title,file); }
  @Get(':id') @ApiOperation({summary:'본인 대화 정보·참여자'})
  find(@CurrentUser() user: AuthUser,@Param('id',new ParseUUIDPipe({version:'4'})) id: string) { return this.chats.find(user,id); }
  @Delete(':id') @HttpCode(204) @ApiOperation({summary:'원본 삭제 후 대화·참여자·메시지 삭제'})
  remove(@CurrentUser() user: AuthUser,@Param('id',new ParseUUIDPipe({version:'4'})) id: string) { return this.chats.remove(user,id); }
  @Get(':id/messages') @ApiOperation({summary:'원문 메시지 검색·필터·페이지 조회'})
  messages(@CurrentUser() user: AuthUser,@Param('id',new ParseUUIDPipe({version:'4'})) id: string,@Query() query: ChatQuery) { return this.chats.messages(user,id,validate(query)); }
  @Get(':id/statistics') @ApiOperation({summary:'기간·참여자별 전체 메시지 집계 · 시스템 제외'})
  statistics(@CurrentUser() user: AuthUser,@Param('id',new ParseUUIDPipe({version:'4'})) id: string,@Query() query: ChatQuery) { return this.chats.statistics(user,id,validate(query)); }
}
