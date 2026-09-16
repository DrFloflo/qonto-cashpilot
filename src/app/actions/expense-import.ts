"use server";

import { db } from "@/db";
import { collaborators, expenseItems } from "@/db/schema";
import { getDashboardData } from "@/lib/calculations";
import { calculateExpenseAmounts } from "@/lib/expense-calculations";
import { revalidatePath } from "next/cache";

function parseDecimal(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatCsvDate(rawDate: string) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  if (!rawDate.includes("/")) return rawDate;

  const parts = rawDate.split("/");
  if (parts.length !== 3) return rawDate;

  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

export async function importExpenseCsvAction(csvContent: string) {
  const nowIso = new Date().toISOString();
  const existingCollaborators = db.select().from(collaborators).all();
  const collaboratorByName = new Map(
    existingCollaborators.map((collaborator) => [collaborator.name.trim().toLowerCase(), collaborator]),
  );
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { success: false, error: "Le fichier CSV est vide ou ne contient pas d'en-tête valide." };
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
  let importedCount = 0;
  const errors: string[] = [];

  for (let index = 1; index < lines.length; index++) {
    const columns = lines[index].split(delimiter).map((column) => column.trim());
    if (columns.every((column) => column === "")) continue;

    const row = Object.fromEntries(headers.map((header, columnIndex) => [header, columns[columnIndex] || ""]));
    const collaboratorName = row.collaborateur || "";

    if (!collaboratorName) {
      errors.push(`Ligne ${index + 1}: Collaborateur manquant`);
      continue;
    }

    const collaboratorKey = collaboratorName.trim().toLowerCase();
    let collaborator = collaboratorByName.get(collaboratorKey);

    if (!collaborator) {
      collaborator = {
        id: `collab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: collaboratorName,
        email: null,
        mileageRate: 0.603,
        active: true,
        createdAt: nowIso,
      };
      db.insert(collaborators).values(collaborator).run();
      collaboratorByName.set(collaboratorKey, collaborator);
    }

    const type = (row.type || "").toUpperCase() === "IK" ? "ik" : "ndf";
    const amounts = calculateExpenseAmounts(
      {
        type,
        amountTtc: parseDecimal(row.montant_ttc || row.montant || ""),
        vatRate: parseDecimal(row.taux_tva || row.tva || "0"),
        prorataRate: parseDecimal(row.prorata || "100", 100),
        distanceKm: parseDecimal(row.km || ""),
      },
      collaborator.mileageRate || 0.603,
    );

    db.insert(expenseItems)
      .values({
        id: `exp-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        collaboratorId: collaborator.id,
        type,
        date: formatCsvDate(row.date || ""),
        label: row.description || row.objet || row.label || "Dépense",
        ...amounts,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    importedCount++;
  }

  revalidatePath("/");
  const updatedDashboard = await getDashboardData();
  return {
    success: true,
    importedCount,
    errors: errors.length > 0 ? errors : undefined,
    updatedDashboard,
  };
}
