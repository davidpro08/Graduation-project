import type {
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";

export const JEV_CLIENT = Symbol("JEV_CLIENT");
export interface JevClient {
  evaluate<Q extends Questions>(
    request: SystemOneRequest<Q>,
  ): Promise<SystemOneResult<Q>>;
}

export type JevErrorCode =
  | "JEV_TIMEOUT"
  | "JEV_CONNECTION_ERROR"
  | "JEV_API_ERROR"
  | "JEV_INVALID_RESPONSE"
  | "JEV_INVALID_REQUEST";

export class JevError extends Error {
  constructor(readonly code: JevErrorCode) {
    super(code);
  }
}

export type JevDecision<Q extends Questions> =
  | { used: true; result: SystemOneResult<Q> }
  | { used: false; reason: "disabled" | "request-disabled" }
  | { used: false; reason: "unavailable"; errorCode: JevErrorCode };
