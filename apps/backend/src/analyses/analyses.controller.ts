import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/auth.types';
import { AnalysesService } from './analyses.service';
import type { AnalysisType } from './analysis.types';
class AnalysisQuery { @IsIn(['contradiction','schedule']) type!:AnalysisType; }
class AnalysisDto extends AnalysisQuery { @IsOptional() @IsBoolean() useJev?:boolean; }
class ScheduleDto {
  @IsString() @MinLength(1) @MaxLength(200) @Matches(/\S/) title!:string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
  @Matches(/^\d{2}:\d{2}$/) time!:string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) endTime?:string;
}
const uuid=new ParseUUIDPipe({version:'4'});
@UseGuards(AuthGuard) @Controller()
export class AnalysesController {
  constructor(private readonly service:AnalysesService){}
  @Post('conversations/:id/analyses') @HttpCode(202)
  create(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Body() body:AnalysisDto){return this.service.create(user,id,body.type,body.useJev!==false);}
  @Get('conversations/:id/analyses')
  async latest(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Query() query:AnalysisQuery){return {job:await this.service.latest(user,id,query.type)};}
  @Get('analyses/:id') find(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string){return this.service.find(user,id);}
  @Get('analyses/:id/result') result(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string){return this.service.result(user,id);}
  @Get('conversations/:id/schedules') schedules(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string){return this.service.schedules(user,id);}
  @Post('schedules/:id/confirm') confirm(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Body() body:ScheduleDto){return this.service.saveSchedule(user,id,body,true);}
  @Patch('schedules/:id') update(@CurrentUser() user:AuthUser,@Param('id',uuid) id:string,@Body() body:ScheduleDto){return this.service.saveSchedule(user,id,body,false);}
}
