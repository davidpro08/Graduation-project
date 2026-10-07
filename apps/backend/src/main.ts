import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function bootstrap() {
  const envPath = resolve(__dirname, '../../../.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT가 유효하지 않습니다.');
  await app.listen(port, '0.0.0.0');
}

void bootstrap().catch(error => { console.error(error); process.exitCode = 1; });
