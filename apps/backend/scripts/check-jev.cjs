require('reflect-metadata');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');
const { NestFactory } = require('@nestjs/core');
const { noul } = require('@typesafe-ai/sdk');
const { AiModule } = require('../dist/ai/ai.module');
const { JevService } = require('../dist/ai/jev.service');

// .env의 비밀 값을 출력하지 않으며 이미 지정된 프로세스 환경변수를 우선한다.
const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envPath, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--skip')) throw new Error('지원하지 않는 인자입니다.');
  const app = await NestFactory.createApplicationContext(AiModule, { logger: false, abortOnError: false });
  try {
    const decision = await app.get(JevService).evaluate({
      state: { messages: [{ speaker: '참여자A', text: '금요일 오후 3시에 회의하자.' }] },
      questions: { hasSchedule: noul('대화에 일정에 대한 언급이 있나요?') },
    }, { useJev: !process.argv.includes('--skip') });
    if (decision.used) {
      console.log(JSON.stringify({ used: true, model: decision.result.model,
        hasScheduleProbability: decision.result.answers.hasSchedule.noul }));
    } else {
      console.log(JSON.stringify(decision));
      if (decision.reason === 'unavailable') process.exitCode = 1;
    }
  } finally { await app.close(); }
}

void main().catch(() => {
  // SDK·Nest 원본 예외에는 비밀 값이 포함될 수 있어 출력하지 않는다.
  console.error('JEV 확인 실패. 환경 설정과 백엔드 빌드 상태를 확인하세요.');
  process.exitCode = 1;
});
