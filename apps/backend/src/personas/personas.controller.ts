import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/auth.types';
import { FacetQueryDto, FilterBody, SamplePersonasDto, SearchPersonasDto } from './persona.dto';
import { PersonasService } from './personas.service';
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('페르소나 데이터') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller('conversations/:id/personas')
export class PersonasController {
  constructor(private readonly service: PersonasService) {}
  @Get('facets') @ApiOperation({ summary: '실제 DB 필터 선택지·시도별 시군구·직업 검색 (50개씩)' })
  facets(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query() query: FacetQueryDto) { return this.service.facets(user, id, query); }
  @Post('preview') @HttpCode(200) @ApiOperation({ summary: '필터 일치 수와 상세/JEV 배정 수 조회' })
  preview(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: FilterBody) { return this.service.preview(user, id, body.filters ?? {}); }
  @Post('search') @HttpCode(200) @ApiOperation({ summary: '실제 페르소나 프로필·요약 목록, 최대50개씩' })
  search(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: SearchPersonasDto) { return this.service.search(user, id, body.filters ?? {}, body.page, body.pageSize); }
  @Post('sample') @HttpCode(200) @ApiOperation({ summary: '필터 적용 후 설정된 인원까지 중복 없이 선택, 같은 seed 재현' })
  sample(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() body: SamplePersonasDto) { return this.service.sample(user, id, body.filters ?? {}, body.seed); }
}
