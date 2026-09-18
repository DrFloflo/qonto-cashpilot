export type FoundryAuthMode = "api-key";

export interface FoundryConfig {
  endpoint: string;
  apiKey: string;
  agentId: string;
  deployment: string;
  authMode: FoundryAuthMode;
  timeoutMs: number;
  maxToolCalls: number;
}

export type FoundryConfigResult =
  | { configured: true; config: FoundryConfig }
  | { configured: false; missing: string[] };

const REQUIRED_VARIABLES = [
  "FOUNDRY_ENDPOINT",
  "FOUNDRY_API_KEY",
  "FOUNDRY_AGENT_ID",
  "FOUNDRY_MODEL_DEPLOYMENT",
] as const;

export function readFoundryConfig(env: Record<string, string | undefined> = process.env): FoundryConfigResult {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { configured: false, missing: [...missing] };

  const endpoint = normalizeEndpoint(env.FOUNDRY_ENDPOINT!);
  if (!endpoint.startsWith("https://")) {
    return { configured: false, missing: ["FOUNDRY_ENDPOINT (URL HTTPS invalide)"] };
  }

  return {
    configured: true,
    config: {
      endpoint,
      apiKey: env.FOUNDRY_API_KEY!.trim(),
      agentId: env.FOUNDRY_AGENT_ID!.trim(),
      deployment: env.FOUNDRY_MODEL_DEPLOYMENT!.trim(),
      authMode: "api-key",
      timeoutMs: integerInRange(env.FOUNDRY_TIMEOUT_MS, 30_000, 1_000, 120_000),
      maxToolCalls: integerInRange(env.FOUNDRY_MAX_TOOL_CALLS, 6, 1, 12),
    },
  };
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function integerInRange(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
