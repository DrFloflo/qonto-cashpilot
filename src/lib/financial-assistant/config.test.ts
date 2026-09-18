import assert from "node:assert/strict";
import test from "node:test";
import { readFoundryConfig } from "./config";

test("reports every missing required Foundry variable", () => {
  const result = readFoundryConfig({});
  assert.equal(result.configured, false);
  if (!result.configured) assert.deepEqual(result.missing, ["FOUNDRY_ENDPOINT", "FOUNDRY_API_KEY", "FOUNDRY_AGENT_ID", "FOUNDRY_MODEL_DEPLOYMENT"]);
});

test("normalizes a configured endpoint and bounds optional values", () => {
  const result = readFoundryConfig({ FOUNDRY_ENDPOINT: "https://example.services.ai.azure.com/models/", FOUNDRY_API_KEY: "secret", FOUNDRY_AGENT_ID: "finance", FOUNDRY_MODEL_DEPLOYMENT: "gpt", FOUNDRY_TIMEOUT_MS: "999999", FOUNDRY_MAX_TOOL_CALLS: "0" });
  assert.equal(result.configured, true);
  if (result.configured) {
    assert.equal(result.config.endpoint, "https://example.services.ai.azure.com/models");
    assert.equal(result.config.timeoutMs, 30000);
    assert.equal(result.config.maxToolCalls, 6);
  }
});

test("rejects a non HTTPS endpoint without exposing credentials", () => {
  const result = readFoundryConfig({ FOUNDRY_ENDPOINT: "http://localhost", FOUNDRY_API_KEY: "secret", FOUNDRY_AGENT_ID: "finance", FOUNDRY_MODEL_DEPLOYMENT: "gpt" });
  assert.deepEqual(result, { configured: false, missing: ["FOUNDRY_ENDPOINT (URL HTTPS invalide)"] });
});
