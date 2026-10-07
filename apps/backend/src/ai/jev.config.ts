export const JEV_CONFIG = Symbol("JEV_CONFIG");
export interface JevConfig {
  enabled: boolean;
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

export function readJevConfig(env: NodeJS.ProcessEnv = process.env): JevConfig {
  const flag = env.JEV_ENABLED?.trim() || "false";
  if (!["true", "false"].includes(flag))
    throw new Error("JEV_ENABLED는 true 또는 false여야 합니다.");
  const enabled = flag === "true";
  const apiKey = env.TYPESAFE_API_KEY?.trim();
  if (enabled && !apiKey)
    throw new Error("JEV_ENABLED=true일 때 TYPESAFE_API_KEY가 필요합니다.");
  const model = env.JEV_MODEL?.trim() || "jev-latest";
  const timeout = env.JEV_TIMEOUT_MS?.trim() || "5000";
  const timeoutMs = Number(timeout);
  if (
    !/^\d+$/.test(timeout) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  )
    throw new Error("JEV_TIMEOUT_MS는 1~60000의 정수여야 합니다.");
  return { enabled, apiKey, model, timeoutMs };
}
