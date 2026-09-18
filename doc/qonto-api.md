# Documentation API Qonto v2 & Intégration

Ce document détaille le fonctionnement, l'authentification et les points d'entrée (endpoints) de l'API Qonto v2 utilisés par **Qonto Prévi**.

---

## 1. Authentification & Sécurité

### Credentials requis

Les identifiants doivent être renseignés dans le fichier local `.env` :

```env
QONTO_API_KEY=votre_cle_api_secrete
QONTO_ORGANIZATION_ID=votre_identifiant_organisation
```

- `QONTO_API_KEY` : Clé secrète générée depuis l'interface Qonto (Menu *Paramètres* > *Intégrations & API* > *Clés API*).
- `QONTO_ORGANIZATION_ID` : L'identifiant (slug ou UUID) de l'organisation.

### En-têtes HTTP (Headers)

L'API Qonto v2 utilise une authentification Basic où le nom d'utilisateur est `QONTO_ORGANIZATION_ID` et le mot de passe est `QONTO_API_KEY` :

```http
Authorization: <QONTO_ORGANIZATION_ID>:<QONTO_API_KEY>
Content-Type: application/json
Accept: application/json
```

URL de base : `https://thirdparty.qonto.com/v2`

---

## 2. Endpoints utilisés

### 2.1 Organisation & Comptes Bancaires

- **Méthode** : `GET`
- **Route** : `/v2/organization`
- **Scope OAuth** : `organization.read`
- **Description** : Récupère les métadonnées de l'entreprise et la liste des comptes bancaires rattachés (`bank_accounts`).
- **Données extraites** :
  - `bank_accounts[0].id` / `slug` : Identifiant du compte principal (requis pour récupérer les transactions).
  - `bank_accounts[0].iban` : IBAN du compte.
  - `bank_accounts[0].balance` / `balance_cents` : Solde actuel en direct.

---

### 2.2 Transactions Bancaires

- **Méthode** : `GET`
- **Route** : `/v2/transactions`
- **Paramètres de requête obligatoires** :
  - `bank_account_id` ou `iban` (l'absence de l'un des deux produit une erreur HTTP 422).
- **Paramètres recommandés** :
  - `status[]=completed` : Pour ne retenir que les opérations validées et comptabilisées.
  - `includes[]=vat_details` : Pour inclure le détail des montants de TVA associés aux opérations.
  - `per_page=100` : Nombre d'opérations par page (maximum autorisé par Qonto par requête : 100).
  - `current_page=1` : Index de page. L'application boucle automatiquement sur les pages (`current_page=1, 2, 3...`) jusqu'à épuisement (`meta.next_page === null` ou `current_page >= meta.total_pages`) pour rapatrier l'ensemble des transactions de l'historique.
  - `sort_by=settled_at:desc` : Tri chronologique inversé (les plus récentes en premier).
- **Exemple d'appel** :
  ```text
  GET /v2/transactions?bank_account_id=018f71db-c635-78b5-b90a-ea05de98c2bf&status[]=completed&includes[]=vat_details&per_page=100&sort_by=settled_at:desc
  ```
- **Champs clés d'une transaction** :
  - `transaction_id` ou `id` : Identifiant unique (idempotence).
  - `amount` / `amount_cents` : Montant absolu de l'opération.
  - `side` : `"credit"` (entrée) ou `"debit"` (sortie).
  - `settled_balance` / `settled_balance_cents` : Solde réel du compte à l'instant de cette transaction.
  - `settled_at` : Horodatage effectif du dénouement bancaire.
  - `vat_details` ou `vat_amount` : Montant de TVA associé.

---

### 2.3 Factures Clients (Client Invoices)

- **Méthode** : `GET`
- **Route** : `/v2/client_invoices`
- **Scope OAuth** : `client_invoices.read`
- **Paramètres recommandés** :
  - `exclude_imported=false` : Inclure toutes les factures, y compris importées.
  - `per_page=100` et `current_page` : toutes les pages sont parcourues jusqu'à `meta.next_page === null` / `meta.total_pages` (avec repli sur une page incomplète si `meta` manque).
- **Statuts possibles** (`status`) :
  - `paid` : Facture payée. En TVA sur encaissements, `paid_at` est exigé pour reconnaître la TVA réelle ; en TVA sur les débits, la date d'émission est utilisée.
  - `unpaid` : Facture validée en attente de paiement (impacte la trésorerie prévisionnelle à la date `due_date`; sa TVA est prévisionnelle uniquement en base encaissements).
  - `canceled` : Facture annulée (ignorée dans les projections).
  - `draft` : Facture brouillon.
- **Structure des montants dans l'API** :
  - Montant TTC : `total_amount.value` ou `total_amount_cents`
  - Montant TVA : `vat_amount.value` ou `vat_amount_cents`
  - Montant HT : `total_amount_ht` ou `subtotal.value` ou `subtotal_cents`
  - Date d'échéance : `due_date`

---

### 2.4 Factures Fournisseurs (Supplier Invoices)

- **Méthode** : `GET`
- **Route** : `/v2/supplier_invoices`
- **Description** : Récupère les factures de vos prestataires et fournisseurs saisies ou importées dans Qonto. La synchronisation parcourt aussi `per_page=100` / `current_page` jusqu'à la dernière page.
- **Utilisation dans Qonto Prévi** :
  - Une facture non annulée est une pièce comptable HT et TVA à sa date d'émission ; son règlement est un flux de trésorerie, pas une seconde charge.
  - Une facture non réglée produit un décaissement prévisionnel à `due_date`.
  - Une transaction porteuse de TVA est exclue si un identifiant de transaction est fourni par la facture ou, à défaut, si date de paiement, montant TTC et fournisseur concordent strictement. Ce rapprochement conservateur ne constitue pas un lettrage exhaustif.

---

## 3. Gestion de l'idempotence

Chaque synchronisation locale utilise l'instruction SQLite `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` via Drizzle ORM. Une facture ou transaction déjà présente n'est jamais dupliquée et voit ses éventuels changements de statut (ex: passage de `unpaid` à `paid`) automatiquement mis à jour.
