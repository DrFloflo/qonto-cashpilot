import assert from "node:assert/strict";
import test from "node:test";
import { assistantToolDefinitions, executeAssistantTool, MAX_TOOL_ROWS } from "./tools";

test("exposes only the predefined read-only tool catalogue", () => {
  const names = assistantToolDefinitions.map((tool) => tool.function.name);
  assert.equal(names.length, 11);
  assert.ok(names.every((name) => /^(get|search)_/.test(name)));
  assert.ok(!names.some((name) => /create|update|delete|sync/i.test(name)));
});

test("rejects unknown tools and excessive limits", async () => {
  await assert.rejects(() => executeAssistantTool("delete_transaction", {}), /non autorisé/);
  await assert.rejects(() => executeAssistantTool("search_transactions", { limit: MAX_TOOL_ROWS + 1 }), /limit/);
});

test("transaction output excludes rawJson and is bounded", async () => {
  const result = await executeAssistantTool("search_transactions", { limit: 1 });
  assert.ok(result.returned <= 1);
  assert.equal(JSON.stringify(result).includes("rawJson"), false);
});

test("validates ISO periods", async () => {
  await assert.rejects(() => executeAssistantTool("search_customer_invoices", { dateFrom: "18/09/2026" }), /YYYY-MM-DD/);
  await assert.rejects(() => executeAssistantTool("search_supplier_invoices", { dateFrom: "2026-09-20", dateTo: "2026-09-01" }), /précéder/);
});
