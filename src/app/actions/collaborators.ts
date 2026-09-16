"use server";

import { db } from "@/db";
import { collaborators } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface CollaboratorInput {
  name: string;
  email?: string;
  mileageRate?: number;
}

export async function getCollaboratorsAction() {
  return db.select().from(collaborators).all();
}

export async function createCollaboratorAction(data: CollaboratorInput) {
  const id = `collab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const mileageRate = data.mileageRate !== undefined && !Number.isNaN(Number(data.mileageRate))
    ? Number(data.mileageRate)
    : 0.53;

  db.insert(collaborators)
    .values({
      id,
      name: data.name.trim(),
      email: data.email?.trim() || null,
      mileageRate,
      active: true,
      createdAt: new Date().toISOString(),
    })
    .run();

  revalidatePath("/");
  return { success: true };
}

export async function updateCollaboratorAction(
  id: string,
  data: CollaboratorInput & { mileageRate: number; active?: boolean },
) {
  db.update(collaborators)
    .set({
      name: data.name.trim(),
      email: data.email?.trim() || null,
      mileageRate: Number(data.mileageRate),
      active: data.active ?? true,
    })
    .where(eq(collaborators.id, id))
    .run();

  revalidatePath("/");
  return { success: true };
}

export async function deleteCollaboratorAction(id: string) {
  db.delete(collaborators).where(eq(collaborators.id, id)).run();
  revalidatePath("/");
  return { success: true };
}
