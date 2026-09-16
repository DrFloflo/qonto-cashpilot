# Spécifications Fonctionnelles & Techniques : Notes de Frais & IK

## 1. Objectifs & Périmètre
- **Gestion des Collaborateurs** : Définition des collaborateurs et de leur barème kilométrique (€ / km).
- **Saisie & Import des Dépenses** :
  - **Notes de Frais standard** (Montant TTC, Taux TVA, Prorata pro/perso %, Objet, Collaborateur, Date).
  - **Indemnités Kilométriques (IK)** (Option A : Nb km x barème collaborateur, TVA à 0%).
  - **Template CSV** pour import en masse.
- **Calculs Fiscaux & Financiers** :
  - Intégration de la **TVA déductible** dans les projections de TVA du dashboard.
  - Calcul du **Montant à rembourser (TTC pris en charge)** tenant compte du prorata : `TTC * Prorata %`.
  - Calcul du **Montant HT** : `TTC / (1 + TVA%)`.
  - Calcul de la **TVA Déductible** : `(TTC - HT) * Prorata %`.
  - Arrondi arithmétique standard à 2 décimales (`round(val * 100) / 100`).
- **Suivi des Remboursements (Vision Globale par Collaborateur)** :
  - Pas de lettrage ligne par ligne.
  - Virement Qonto affecté globalement au solde d'un collaborateur (ex: virement rond de 600 €).
  - Indicateurs clairs par collaborateur : **Total dû (engagé pro)**, **Total remboursé (virements liés)**, **Reste à payer**.
- **Interface Dédiée** : Onglet dédié "Notes de frais & IK" dans le dashboard.

---

## 2. Règles de Calcul Métier

### 2.1. Note de Frais Standard
Pour une ligne de dépense :
- `Montant TTC total saisi` ($TTC$)
- `Taux TVA` ($TVA\%$, ex: 20%)
- `Prorata pro` ($P\%$, ex: 50%)
- **Montant HT reconstitué** :
  $$HT = \text{round}\left(\frac{TTC}{1 + \frac{TVA\%}{100}}\right)$$
- **Montant pris en charge & à rembourser au collaborateur** :
  $$\text{Montant Remboursable} = \text{round}\left(TTC \times \frac{P\%}{100}\right)$$
- **TVA déductible récupérable par l'entreprise** :
  $$\text{TVA Déductible} = \text{round}\left((TTC - HT) \times \frac{P\%}{100}\right)$$

### 2.2. Indemnités Kilométriques (IK)
- Saisie : `Nombre de kilomètres` ($km$), `Collaborateur`, `Date`, `Objet`.
- Barème : $Taux_{\text{km}}$ configuré sur le collaborateur (ex: $0.603$ € / km).
- `Montant TTC / HT` :
  $$\text{Montant IK} = \text{round}(km \times Taux_{\text{km}})$$
- `Taux TVA` : $0\%$
- `TVA Déductible` : $0.00\text{ €}$
- `Prorata pro` : $100\%$
- `Montant Remboursable` : $\text{Montant IK}$

### 2.3. Impact sur la TVA du Dashboard
- La TVA déductible des notes de frais est ajoutée à la ligne **TVA déductible** sur la période (mois/trimestre) correspondant à la **date de la dépense**.

### 2.4. Suivi des Remboursements (Compte Courant / Balance Collaborateur)
Pour chaque collaborateur :
- $\text{Total Dû} = \sum (\text{Montant Remboursable des dépenses})$
- $\text{Total Remboursé} = \sum (\text{Montant des virements Qonto affectés})$
- $\text{Reste à Payer} = \text{Total Dû} - \text{Total Remboursé}$

---

## 3. Format du Template CSV

Le template CSV d'import comprend les colonnes suivantes (séparateur `;` ou `,`) :

```csv
date;type;collaborateur;description;montant_ttc;taux_tva;prorata;km
2026-03-01;NDF;Jean Dupont;Abonnement téléphone;48.00;20;50;
2026-03-02;NDF;Jean Dupont;Restaurant client;94.05;10;100;
2026-03-05;IK;Jean Dupont;Visite client Lyon;;0;100;120
```

### Règles d'import :
- `date` : Format `YYYY-MM-DD` ou `DD/MM/YYYY`.
- `type` : `NDF` (Note de frais) ou `IK` (Indemnité kilométrique).
- `collaborateur` : Nom du collaborateur (reconnu ou créé si inexistant).
- `description` : Libellé de la dépense.
- Si `type = NDF` :
  - `montant_ttc` requis.
  - `taux_tva` (défaut 20%).
  - `prorata` (défaut 100%).
- Si `type = IK` :
  - `km` requis.
  - `montant_ttc` calculé automatiquement via `km * barème_collaborateur`.
  - `taux_tva = 0`, `prorata = 100`.

---

## 4. Modèle de Données (Drizzle ORM / SQLite)

### 4.1. Table `collaborators`
```typescript
export const collaborators = sqliteTable("collaborators", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull(),
  email: text("email"),
  mileageRate: real("mileage_rate").notNull().default(0.603), // Barème € / km
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});
```

### 4.2. Table `expense_items`
```typescript
export const expenseItems = sqliteTable("expense_items", {
  id: text("id").primaryKey(), // uuid
  collaboratorId: text("collaborator_id").notNull().references(() => collaborators.id),
  type: text("type").notNull(), // "ndf" | "ik"
  date: text("date").notNull(), // YYYY-MM-DD
  label: text("label").notNull(),
  
  // Amounts
  amountTtc: real("amount_ttc").notNull(),
  amountHt: real("amount_ht").notNull(),
  vatRate: real("vat_rate").notNull().default(0), // % TVA
  prorataRate: real("prorata_rate").notNull().default(100), // % Prorata pro (ex: 50)
  
  // Calculated stored fields
  vatDeductible: real("vat_deductible").notNull().default(0),
  reimbursableAmount: real("reimbursable_amount").notNull(), // TTC engagé au prorata
  
  // IK specific
  distanceKm: real("distance_km"),
  
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

### 4.3. Table `expense_reimbursements` (Liaisons Virements Qonto)
```typescript
export const expenseReimbursements = sqliteTable("expense_reimbursements", {
  id: text("id").primaryKey(), // uuid
  collaboratorId: text("collaborator_id").notNull().references(() => collaborators.id),
  transactionId: text("transaction_id").references(() => transactions.id), // Transaction Qonto (optionnel si virement manuel)
  amount: real("amount").notNull(), // Montant remboursé (ex: 600.00)
  date: text("date").notNull(), // Date du virement
  note: text("note"),
  createdAt: text("created_at").notNull(),
});
```
