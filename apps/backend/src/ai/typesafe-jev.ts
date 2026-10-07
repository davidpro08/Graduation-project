import { Inject, Injectable } from "@nestjs/common";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  TypeSafeClient,
  type Questions,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import { JevError, type JevClient } from "./jev.client";
import { JEV_CONFIG, type JevConfig } from "./jev.config";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const probability = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

// SDK 타입 선언과 별개로 외부 응답을 런타임 검증한다.
function validResult(value: unknown, questions: Questions): boolean {
  if (
    !object(value) ||
    typeof value.model !== "string" ||
    !value.model.trim() ||
    !object(value.answers) ||
    !object(value.usage)
  )
    return false;
  const usage = value.usage;
  if (
    !["input_tokens", "output_tokens"].every(
      (key) =>
        typeof usage[key] === "number" &&
        Number.isSafeInteger(usage[key]) &&
        usage[key] >= 0,
    )
  )
    return false;
  return Object.entries(questions).every(([name, question]) => {
    const answer = (value.answers as Record<string, unknown>)[name];
    if (!object(answer) || answer.type !== question.type) return false;
    if (question.type === "noul") return probability(answer.noul);
    if (!probability(answer.confidence) || !object(answer.probabilities))
      return false;
    const keys =
      question.type === "choice"
        ? Object.keys(question.criteria)
        : question.criteria.map((_, index) => String(index));
    if (
      !keys.every((key) =>
        probability((answer.probabilities as Record<string, unknown>)[key]),
      )
    )
      return false;
    if (question.type === "choice")
      return typeof answer.choice === "string" && keys.includes(answer.choice);
    return (
      typeof answer.score === "number" &&
      Number.isFinite(answer.score) &&
      answer.score >= 0 &&
      answer.score <= question.criteria.length - 1
    );
  });
}

@Injectable()
export class TypeSafeJev implements JevClient {
  private client?: TypeSafeClient;
  constructor(@Inject(JEV_CONFIG) private readonly config: JevConfig) {}

  async evaluate<Q extends Questions>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResult<Q>> {
    if (!this.config.enabled || !this.config.apiKey)
      throw new JevError("JEV_INVALID_REQUEST");
    try {
      this.client ??= new TypeSafeClient({
        apiKey: this.config.apiKey,
        baseURL: "https://api.typesafe.ai",
        defaultModel: this.config.model,
        timeout: this.config.timeoutMs,
        retry: { maxRetries: 0 },
        // 환경변수의 debug 설정으로 대화 본문이 로그에 노출되지 않게 명시한다.
        logLevel: "off",
      });
      const result = await this.client.systemOne({
        state: request.state,
        questions: request.questions,
        model: this.config.model,
      });
      if (!validResult(result, request.questions))
        throw new JevError("JEV_INVALID_RESPONSE");
      return result;
    } catch (error) {
      if (error instanceof JevError) throw error;
      if (error instanceof APITimeoutError) throw new JevError("JEV_TIMEOUT");
      if (error instanceof APIConnectionError)
        throw new JevError("JEV_CONNECTION_ERROR");
      if (error instanceof APIError) throw new JevError("JEV_API_ERROR");
      if (error instanceof SyntaxError)
        throw new JevError("JEV_INVALID_RESPONSE");
      throw new JevError("JEV_INVALID_REQUEST");
    }
  }
}
