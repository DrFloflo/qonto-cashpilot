import assert from "node:assert/strict";
import test from "node:test";

import { selectMainBankAccount } from "./qonto";

test("selects the Qonto account marked as main instead of the first wallet", () => {
  const selected = selectMainBankAccount([
    {
      id: "vat-wallet",
      name: "TVA",
      status: "active",
      main: false,
      is_external_account: false,
      balance: 0,
    },
    {
      id: "main-account",
      name: "Compte principal",
      status: "active",
      main: true,
      is_external_account: false,
      balance: 14_474,
    },
  ]);

  assert.equal(selected?.id, "main-account");
});

test("falls back to an active internal account when no account is marked as main", () => {
  const selected = selectMainBankAccount([
    { id: "closed", status: "closed", is_external_account: false },
    { id: "external", status: "active", is_external_account: true },
    { id: "internal", status: "active", is_external_account: false },
  ]);

  assert.equal(selected?.id, "internal");
});

test("returns null when Qonto exposes no bank account", () => {
  assert.equal(selectMainBankAccount([]), null);
});
