import process from 'node:process';
import { cpSync, existsSync } from 'node:fs';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const serverRoot = join(appRoot, '.next', 'standalone', 'apps', 'frontend');
if (!existsSync(join(serverRoot, 'server.js'))) throw new Error('먼저 pnpm build를 실행해 주세요.');
// standalone 출력에는 정적 자산이 자동 복사되지 않는다.
cpSync(join(appRoot, '.next', 'static'), join(serverRoot, '.next', 'static'), { recursive: true });
if (existsSync(join(appRoot, 'public'))) cpSync(join(appRoot, 'public'), join(serverRoot, 'public'), { recursive: true });
process.env.PORT ??= '5173';
process.env.HOSTNAME = '0.0.0.0';
await import(pathToFileURL(join(serverRoot, 'server.js')).href);
