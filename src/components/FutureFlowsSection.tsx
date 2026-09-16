"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import {
  createFutureFlowAction,
  deleteFutureFlowAction,
  toggleFutureFlowAction,
  updateFutureFlowAction,
} from "@/app/actions";
import type { FutureFlow } from "@/db/schema";
import type { DashboardData } from "@/lib/calculations";
import { FutureFlowModal } from "./future-flows/FutureFlowModal";
import { FutureFlowsTable } from "./future-flows/FutureFlowsTable";
import type { FutureFlowFormState } from "./future-flows/types";
import { calculateFlowAmounts, createFutureFlowForm } from "./future-flows/utils";

interface FutureFlowsSectionProps {
  flows: FutureFlow[];
  onDataUpdated?: (newData: DashboardData) => void;
}

export function FutureFlowsSection({ flows, onDataUpdated }: FutureFlowsSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<FutureFlow | null>(null);
  const [form, setForm] = useState<FutureFlowFormState>(() => createFutureFlowForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const notifyDashboard = (result: { updatedData?: DashboardData }) => {
    if (result.updatedData) onDataUpdated?.(result.updatedData);
  };

  const openModal = (flow?: FutureFlow) => {
    setEditingFlow(flow ?? null);
    setForm(createFutureFlowForm(flow));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFlow(null);
  };

  const updateForm = <K extends keyof FutureFlowFormState>(
    field: K,
    value: FutureFlowFormState[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const { ht } = calculateFlowAmounts(form.amountHt, form.vatRate);
    if (!form.label.trim() || ht <= 0) return;

    const values = {
      ...form,
      label: form.label.trim(),
      amountHt: ht,
    };

    setIsSubmitting(true);
    try {
      const result = editingFlow
        ? await updateFutureFlowAction(editingFlow.id, values)
        : await createFutureFlowAction(values);
      notifyDashboard(result);
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce flux prévisionnel ?")) return;

    setDeletingId(id);
    try {
      notifyDashboard(await deleteFutureFlowAction(id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (flow: FutureFlow) => {
    setTogglingId(flow.id);
    try {
      notifyDashboard(await toggleFutureFlowAction(flow.id, !flow.enabled));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-border/60 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Flux Futurs & Prévisionnels
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Flux manuels et récurrences détectées automatiquement à partir de deux opérations mensuelles identiques
          </p>
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="inline-flex cursor-pointer items-center justify-center gap-2 self-start rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Ajouter un flux
        </button>
      </div>

      <FutureFlowsTable
        flows={flows}
        deletingId={deletingId}
        togglingId={togglingId}
        onEdit={openModal}
        onDelete={handleDelete}
        onToggle={handleToggle}
      />

      {isModalOpen && (
        <FutureFlowModal
          editingFlow={editingFlow}
          form={form}
          isSubmitting={isSubmitting}
          onChange={updateForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
