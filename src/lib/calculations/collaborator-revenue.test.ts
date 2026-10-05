import assert from "node:assert/strict";
import test from "node:test";
import { calculateCollaboratorRevenue, validateRevenueAllocations } from "./collaborator-revenue";

test("requires unique executors whose shares total exactly 100 percent", () => {
  assert.throws(() => validateRevenueAllocations([{ collaboratorId: "a", sharePercent: 60 }, { collaboratorId: "b", sharePercent: 30 }]), /100 %/);
  assert.throws(() => validateRevenueAllocations([{ collaboratorId: "a", sharePercent: 50 }, { collaboratorId: "a", sharePercent: 50 }]), /une seule fois/);
  assert.deepEqual(validateRevenueAllocations([{ collaboratorId: "a", sharePercent: 33.33 }, { collaboratorId: "b", sharePercent: 66.67 }]).map((item) => item.shareBasisPoints), [3333, 6667]);
});

test("allocates every cent and lets the last executor absorb rounding remainder", () => {
  const result = calculateCollaboratorRevenue(
    [{ id: "invoice", documentType: "invoice", amountHtCents: 10001 }],
    [{ customerInvoiceId: "invoice", collaboratorId: "a", shareBasisPoints: 5000 }, { customerInvoiceId: "invoice", collaboratorId: "b", shareBasisPoints: 5000 }],
    [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }],
  );
  assert.equal(result.allocatedRevenueCents, 10001);
  assert.deepEqual(result.rows.map((row) => row.revenueCents).sort(), [5000, 5001]);
});

test("credit notes inherit allocation from their original invoice", () => {
  const result = calculateCollaboratorRevenue(
    [
      { id: "invoice", documentType: "invoice", amountHtCents: 10000 },
      { id: "credit", originalInvoiceId: "invoice", documentType: "credit_note", amountHtCents: -2000 },
    ],
    [{ customerInvoiceId: "invoice", collaboratorId: "a", shareBasisPoints: 2500 }, { customerInvoiceId: "invoice", collaboratorId: "b", shareBasisPoints: 7500 }],
    [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }],
  );
  assert.equal(result.allocatedRevenueCents, 8000);
  assert.deepEqual(result.rows.map((row) => [row.collaboratorName, row.revenueCents, row.creditNoteCount]), [["Bob", 6000, 1], ["Alice", 2000, 1]]);
});

test("reports invoices without an allocation", () => {
  const result = calculateCollaboratorRevenue([{ id: "invoice", documentType: "invoice", amountHtCents: 100 }], [], []);
  assert.equal(result.unallocatedInvoiceCount, 1);
  assert.equal(result.allocatedRevenueCents, 0);
});
