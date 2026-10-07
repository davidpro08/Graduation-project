import { Inject, Injectable } from "@nestjs/common";
import type { Questions, SystemOneRequest } from "@typesafe-ai/sdk";
import {
  JEV_CLIENT,
  JevError,
  type JevClient,
  type JevDecision,
} from "./jev.client";
import { JEV_CONFIG, type JevConfig } from "./jev.config";

@Injectable()
export class JevService {
  constructor(
    @Inject(JEV_CONFIG) private readonly config: JevConfig,
    @Inject(JEV_CLIENT) private readonly client: JevClient,
  ) {}

  async evaluate<Q extends Questions>(
    request: SystemOneRequest<Q>,
    options: { useJev?: boolean } = {},
  ): Promise<JevDecision<Q>> {
    if (!this.config.enabled) return { used: false, reason: "disabled" };
    if (options.useJev === false)
      return { used: false, reason: "request-disabled" };
    try {
      return { used: true, result: await this.client.evaluate(request) };
    } catch (error) {
      if (!(error instanceof JevError)) throw error;
      // JEV 실패는 후보 없음이 아니다. 호출자는 원문을 유지하고 LLM 경로로 이어간다.
      return { used: false, reason: "unavailable", errorCode: error.code };
    }
  }
}
