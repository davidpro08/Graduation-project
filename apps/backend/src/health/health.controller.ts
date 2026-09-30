import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

class HealthResponse {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'backend', enum: ['backend'] })
  service!: 'backend';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthResponse, description: '백엔드 프로세스 정상' })
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'backend' };
  }
}
