import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import type { AuthUser } from '../auth/auth.types';
import { UpdateUserDto, UserResponse } from './user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰 누락 또는 유효하지 않은 인증' })
@ApiNotFoundResponse({ description: '프로필 없음' })
@ApiServiceUnavailableResponse({ description: '인증 또는 DB 서비스 장애' })
@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('me')
  @ApiOkResponse({ type: UserResponse })
  find(@CurrentUser() user: AuthUser) { return this.users.find(user); }

  @Patch('me')
  @ApiOkResponse({ type: UserResponse })
  @ApiBadRequestResponse({ description: '닉네임 형식 또는 허용하지 않은 필드' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) { return this.users.update(user, dto.nickname); }
}
