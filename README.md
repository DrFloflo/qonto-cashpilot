# Qonto Prévi — Dashboard de pilotage de trésorerie

Application web locale moderne, sobre et minimaliste permettant de piloter la trésorerie d'une entreprise à partir des données bancaires et factures Qonto.

## ✨ Fonctionnalités

- **Trésorerie Actuelle** : Solde en temps réel du compte bancaire Qonto.
- **Trésorerie Projetée** : Modélisation à 30 jours, 60 jours, 90 jours et 12 mois prenant en compte les factures clients/fournisseurs et les flux futurs.
- **TVA à Provisionner sur l'Exercice Fiscal & Règles Fiscales Françaises** :
  - Calcul dynamique calé sur les bornes de l'exercice fiscal en cours (date de clôture configurable, ex: 31/12 ou exercice décalé).
  - Prise en compte du régime fiscal sélectionné : **Régime Réel Normal** (mensuel ou trimestriel) ou **Régime Réel Simplifié** (RSI).
  - Gestion des seuils légaux français de remboursement de crédit de TVA : seuil légal de **760 €** en régime normal (CGI annexe II art. 242-0 A) au-delà duquel le crédit est remboursable (sinon automatiquement reporté sur la période suivante), et seuil annuel de **150 €** sur la CA12 en régime simplifié.
- **Paramètres Fiscaux Configurables** : Bouton engrenage dans le bandeau de navigation pour configurer le jour/mois de fin d'exercice fiscal, le régime de TVA et la méthode d'exigibilité (débits ou encaissements).
- **CA & Charges du mois** : Suivi des encaissements et décaissements réels du mois en cours avec modales de drill-down détaillées au clic.
- **Graphique interactif Évolution & Projection** (Recharts) :
  - Période de réel configurable (7j, 14j, 30j, 90j) et projection configurable (30j, 60j, 90j, 12 mois).
  - Granularité journalière continue sur tous les horizons pour garantir qu'aucune opération future ne soit masquée.
  - Drill-down interactif : clic sur un point du graphique présentant des entrées ou sorties pour ouvrir le détail de toutes les opérations de la journée.
- **Gestion des flux futurs (CRUD)** : Ajout, modification, suppression instantanée de flux manuels avec calcul automatique en temps réel du TTC et de la TVA, gestion des récurrences (ponctuel, mensuel, trimestriel, annuel).
- **Synchronisation automatique et paginée Qonto** : Récupération idempotente et paginée (gestion multi-pages au-delà des 100 transactions par défaut) du solde, des transactions, des factures clients et des factures fournisseurs via l'API Qonto v2.
- **Base de données embarquée** : SQLite local avec Drizzle ORM (`./data/previ.db`), sans aucun serveur de base de données externe à installer.

## 📚 Documentation API

La documentation détaillée de l'intégration et des endpoints Qonto v2 est consultable dans [`doc/qonto-api.md`](doc/qonto-api.md).

## 🚀 Démarrage

### 1. Installation

```bash
npm install
```

### 2. Configuration Qonto

Dans le fichier `.env` à la racine :

```env
QONTO_API_KEY=votre_cle_api_secrete
QONTO_ORGANIZATION_ID=votre_identifiant_organisation
```

### 3. Lancer l'application

```bash
npm run dev
```

Rendez-vous sur [http://localhost:3000](http://localhost:3000) et cliquez sur **Synchroniser Qonto**.
