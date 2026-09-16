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
- **Détection automatique des flux récurrents** : Analyse des transactions des deux derniers mois et création d'un flux futur mensuel lorsqu'au moins deux opérations présentent le même montant, le même fournisseur et un intervalle approximatif de 30 jours (entre 25 et 35 jours).
  - La détection est exécutée lors d'une synchronisation Qonto et au chargement du tableau de bord, ce qui permet également d'analyser l'historique déjà enregistré.
  - La prochaine occurrence est calculée un mois après la transaction correspondante la plus récente.
  - Les flux détectés portent le badge **Ajout automatique** afin de les distinguer des flux saisis manuellement.
  - Chaque flux peut être activé ou désactivé. Un flux désactivé reste visible, conserve la préférence de l'utilisateur après une nouvelle détection et n'est plus inclus dans les projections de trésorerie ni dans les calculs de TVA.
  - Les détections devenues obsolètes sont retirées automatiquement lorsqu'elles ne correspondent plus à deux opérations éligibles dans la fenêtre glissante des deux derniers mois.
  - La suppression directe d'un flux automatique n'est pas persistante tant que ses transactions sources restent éligibles : il sera recréé lors de l'analyse suivante. Utilisez donc la désactivation pour l'exclure durablement des prévisions.
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

## 🔁 Fonctionnement de la détection des récurrences

Une transaction est considérée comme mensuellement récurrente lorsque les conditions suivantes sont réunies :

1. les deux opérations appartiennent aux **deux derniers mois** ;
2. elles ont le **même sens** — entrée ou sortie ;
3. leur montant est strictement identique au centime près ;
4. leur fournisseur ou contrepartie normalisé est identique ;
5. leur date est espacée de **25 à 35 jours**.

Pour identifier la contrepartie, l'application utilise en priorité le nom nettoyé fourni par Qonto (`clean_counterparty_name`), puis le libellé bancaire si ce champ n'est pas disponible. Les différences de casse, d'accents et de ponctuation sont neutralisées pendant la comparaison.

Le montant TTC de la transaction est décomposé à partir de la TVA communiquée par Qonto afin d'enregistrer le montant HT et le taux de TVA du flux prévisionnel. Si aucune TVA n'est disponible, le flux est créé avec un taux de 0 %.

> **Conseil :** pour ignorer une récurrence détectée automatiquement, désactivez-la avec l'interrupteur **Actif**. La suppression seule ne constitue pas un rejet, car le même motif peut être détecté de nouveau tant que les transactions correspondantes restent dans la fenêtre d'analyse.
