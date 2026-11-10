// 실제 CPU JEV와 기존 HTTP 어댑터를 같은 합성 페르소나/쟁점으로 검증한다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { JevOpinionHttp } = require('../dist/debates/debate.http');
const { aggregate } = require('../dist/debates/debate.statistics');
const env = resolve(__dirname, '../../../.env'); if (existsSync(env)) process.loadEnvFile(env);
const personas = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
const topic = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8')).document;
const output = resolve(process.argv[4] || '.tmp/jev-cpu-report.json');
assert.ok(Array.isArray(personas) && personas.length >= 1 && personas.length <= 50 && typeof topic.proposition === 'string');
const client = new JevOpinionHttp(), responses = [], timings = [], metadata = [];
const originalFetch = global.fetch;
global.fetch = async (...args) => { const response = await originalFetch(...args); const data = await response.clone().json(); if (data.metadata) metadata.push({ personaId: data.personaId, ...data.metadata }); return response; };
const report = { startedAt: new Date().toISOString(), status: 'running', metadata, timings, responses };
async function main() {
  client.ready(); const start = performance.now(); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, personas.length) }, async () => {
    while (cursor < personas.length) {
      const person = personas[cursor++], begin = performance.now();
      const result = await client.respond(topic, person, AbortSignal.timeout(180000));
      assert.equal(result.opinion.scoreKind, 'conditional_option_probability');
      const { persona: _source, ...profile } = person; void _source;
      responses.push({ persona: profile, mode: 'jev', status: 'completed', ...result });
      timings.push({ personaId: person.id, milliseconds: Math.round(performance.now() - begin) });
    }
  }));
  assert.equal(metadata.length, personas.length); assert.ok(metadata.every(row => row.device === 'cpu'));
  report.status = 'passed'; report.milliseconds = Math.round(performance.now() - start); report.statistics = aggregate(responses);
  console.log(JSON.stringify({ status: report.status, answered: responses.length, milliseconds: report.milliseconds, forwardMilliseconds: metadata.map(row => row.forwardMilliseconds), inputTokens: metadata.map(row => row.inputTokens), distribution: report.statistics.distribution }));
}
void main().catch(error => { report.status = 'failed'; report.error = error.message; console.error(error.message); process.exitCode = 1; })
  .finally(() => { global.fetch = originalFetch; mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2)); });
