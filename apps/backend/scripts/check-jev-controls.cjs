// 모델 품질 대조 실험이다. 오분류를 코드 오류나 성공한 판정으로 숨기지 않는다.
require('reflect-metadata');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { JevOpinionHttp } = require('../dist/debates/debate.http');
const env = resolve(__dirname, '../../../.env'); if (existsSync(env)) process.loadEnvFile(env);
const sample = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'))[0];
const topic = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8')).document;
const output = resolve(process.argv[4] || '.tmp/jev-controls.json');
const client = new JevOpinionHttp();
const cases = [
  { id: 'oppose', expected: -1, text: '이 합성 인물은 불가피한 사정이 증명된 지각에도 벌금을 절대 면제하면 안 된다고 명시적으로 주장한다. 어떤 이유로 늦었든 예외 없이 전원 벌금을 내야 한다며 이 면제 주장에 강하게 반대한다.' },
  { id: 'neutral', expected: 0, text: '이 합성 인물은 불가피한 사정으로 지각했을 때 벌금을 면제할지에 대해 찬성도 반대도 하지 않는다고 명시한다. 본인의 입장은 중립이며 어느 쪽도 선호하지 않는다.' },
  { id: 'support', expected: 1, text: '이 합성 인물은 불가피한 사정이 증명된 지각은 반드시 벌금을 면제해야 한다고 명시적으로 주장한다. 면제를 적극 지지하며 이 주장에 강하게 찬성한다.' },
];
async function main() {
  const results = [];
  for (const item of cases) {
    const begin = performance.now();
    const result = await client.respond(topic, { ...sample, persona: item.text }, AbortSignal.timeout(180000));
    results.push({ id: item.id, expected: item.expected, ...result, milliseconds: Math.round(performance.now() - begin), matchesExpected: result.opinion.agreement === item.expected });
  }
  const report = { kind: '명시적 입장을 넣은 합성 대조 사례. 실사용 정확도 추정 아님.', results, exactMatches: results.filter(row => row.matchesExpected).length, total: results.length };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
