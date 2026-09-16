# Qonto Prévi — Dashboard de pilotage de trésorerie

Application web locale moderne, sobre et minimaliste permettant de piloter la trésorerie d'une entreprise à partir des données bancaires et factures Qonto.

## ✨ Fonctionnalités

- **Trésorerie Actuelle** : Solde en temps réel du compte bancaire Qonto.
- **Trésorerie Projetée** : Modélisation à 30 jours, 60 jours, 90 jours et 12 mois prenant en compte les factures clients/fournisseurs et les flux futurs.
- **TVA à Provisionner** : Estimation de la TVA nette (collectée vs déductible sur factures payées, factures à échoir et flux prévisionnels).
- **CA & Charges du mois** : Suivi des encaissements et décaissements réels du mois en cours.
- **Graphique interactif** (Recharts) : Séparation nette entre historique réel et projection prévisionnelle, repère visuel de la date du jour, sélecteur d'horizon (30j / 60j / 90j / 12 mois).
- **Gestion des flux futurs (CRUD)** : Ajout, modification, suppression instantanée de flux manuels avec calcul automatique en temps réel du TTC et de la TVA, gestion des récurrences (ponctuel, mensuel, trimestriel, annuel).
- **Synchronisation manuelle Qonto** : Récupération idempotente du solde, des transactions, des factures clients et des factures fournisseurs via API Qonto v2.
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
