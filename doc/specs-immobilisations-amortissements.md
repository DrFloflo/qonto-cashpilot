# Spécifications — Immobilisations & amortissements

## 1. Statut du document

- **Phase** : proposition à valider avant développement.
- **Périmètre juridique et fiscal** : France, société soumise à l'impôt sur les sociétés et assujettie à la TVA.
- **Avertissement** : cette fonctionnalité fournit une aide au pilotage et à la préparation comptable. Elle ne remplace ni le registre officiel des immobilisations ni la validation de l'expert-comptable.

## 2. Objectifs

Ajouter au dashboard un onglet dédié **« Immobilisations & amortissements »** permettant de :

- enregistrer, modifier et supprimer une immobilisation ;
- établir son plan d'amortissement linéaire ;
- suivre les dotations mensuelles et annuelles par exercice fiscal ;
- afficher les amortissements cumulés et la valeur nette comptable (VNC) ;
- reprendre des immobilisations déjà partiellement amorties ;
- enregistrer une cession ou une mise au rebut ;
- exporter le registre et le plan d'amortissement au format CSV ;
- intégrer la dotation aux amortissements aux indicateurs comptables du dashboard, sans créer de flux de trésorerie ;
- rattacher chaque immobilisation à plusieurs sources d'achat homogènes : plusieurs transactions Qonto, plusieurs notes de frais ou plusieurs factures fournisseur ; les familles de sources ne sont pas mélangées sur un même actif.

## 3. Principes comptables retenus

### 3.1. Base amortissable

- Si la TVA est récupérable : coût d'entrée = montant HT augmenté des frais accessoires immobilisables HT.
- Si la TVA n'est pas récupérable : coût d'entrée = montant TTC augmenté des frais accessoires immobilisables TTC.
- Base amortissable = coût d'entrée - valeur résiduelle.
- La valeur résiduelle est facultative et vaut 0 € par défaut.
- La valeur résiduelle ne peut pas être négative ni dépasser le coût d'entrée.

Les frais accessoires peuvent notamment inclure livraison, installation, montage et coûts directement nécessaires à la mise en service. Les charges financières et coûts non directement attribuables sont exclus en V1.

### 3.2. Seuil d'immobilisation

- Seuil indicatif par défaut : **500 € HT unitaire** pour les biens pouvant relever de la tolérance fiscale des biens de faible valeur.
- Une immobilisation sous ce seuil déclenche une **alerte non bloquante** : l'utilisateur peut confirmer l'immobilisation ou comptabiliser le bien en charge hors de ce module.
- Le seuil est configurable dans les paramètres.
- Le seuil ne décide pas automatiquement du traitement comptable : la nature du bien, sa durée d'utilisation et les règles applicables restent déterminantes.

### 3.3. Méthode et point de départ

- Méthode V1 : **amortissement linéaire** uniquement.
- Le point de départ est la **date de mise en service**, distincte de la date d'achat.
- La date de mise en service doit être égale ou postérieure à la date d'achat.
- La durée est saisie en mois entiers ; l'interface propose aussi des raccourcis en années.
- Taux annuel indicatif affiché = 100 / durée en années.
- Le plan est calculé au prorata temporis journalier, selon le nombre réel de jours de chaque intervalle et de chaque année civile (365 ou 366 jours).
- La somme finale des dotations est ajustée au centime pour être exactement égale à la base amortissable, hors sortie anticipée.

> Point à valider : la convention « jours réels / 365 ou 366 » est proposée pour la précision du pilotage. Si le cabinet utilise une convention de 360 jours, cette règle devra être remplacée ou rendue paramétrable avant développement.

### 3.4. TVA

- Les champs HT, TVA et TTC sont conservés séparément.
- Le taux de TVA est saisi ; le montant de TVA et le TTC peuvent être calculés, avec possibilité de corriger les montants selon la facture.
- Le caractère récupérable de la TVA est explicite.
- En cas de récupération partielle, un coefficient de déduction de 0 à 100 % est disponible.
- Coût d'entrée = HT + TVA non récupérable + frais accessoires selon leur propre traitement de TVA.
- La TVA déductible reste rattachée à la facture ou transaction d'origine ; l'amortissement ne génère aucune TVA supplémentaire.

### 3.5. Exercices fiscaux

- Les dotations sont ventilées selon les dates d'ouverture et de clôture configurées dans le dashboard.
- Un exercice décalé est pris en charge.
- Pour chaque exercice : VNC d'ouverture, dotation de l'exercice, amortissements cumulés et VNC de clôture.
- La vue mensuelle répartit la dotation par mois en respectant le prorata journalier.

### 3.6. Absence d'impact sur la trésorerie

- L'achat est un flux de trésorerie provenant de la transaction ou facture fournisseur, s'il existe.
- La dotation est une charge calculée non décaissée : elle affecte le résultat comptable estimé, mais jamais le solde bancaire ni les projections de trésorerie.
- Un même achat ne doit pas être compté à la fois en charge courante et en dotation. Lorsqu'une immobilisation est liée à une transaction Qonto, une note de frais ou une facture fournisseur, sa charge HT doit être neutralisée dans le calcul de résultat et remplacée par la dotation de la période.
- Cette neutralisation comptable ne supprime jamais le décaissement bancaire ni, dans le cas d'une note de frais, la dette et le remboursement dus au collaborateur.
- Si la source est une note de frais avec prorata professionnel, seule la part professionnelle immobilisable sert à constituer le coût d'entrée ; la part personnelle reste exclue.

## 4. Données d'une immobilisation

### 4.1. Champs obligatoires

- Libellé.
- Catégorie comptable.
- Date d'achat.
- Date de mise en service.
- Fournisseur.
- Montant HT.
- Taux ou montant de TVA.
- Montant TTC.
- TVA récupérable : oui/non ; coefficient si récupération partielle.
- Durée d'amortissement en mois.
- Méthode : linéaire, seule valeur disponible en V1.

### 4.2. Champs facultatifs ou calculés

- Numéro interne d'immobilisation, généré automatiquement et modifiable.
- Description ou notes.
- Numéro de facture.
- Source d'achat exclusive : `transaction_qonto`, `note_de_frais`, `facture_fournisseur` ou `aucune` pour une reprise d'antériorité ou une saisie sans source disponible.
- Lien vers une transaction Qonto lorsque la source est `transaction_qonto`.
- Lien vers une note de frais lorsque la source est `note_de_frais`.
- Lien facultatif supplémentaire vers une facture fournisseur Qonto, quelle que soit la source d'achat.
- Frais accessoires immobilisables.
- Valeur résiduelle.
- Coût d'entrée calculé.
- Base amortissable calculée.
- Compte d'immobilisation suggéré.
- Compte d'amortissement suggéré.
- Compte de dotation suggéré.
- Quantité, égale à 1 par défaut. Une quantité supérieure reste une seule fiche et n'est pas ventilée en plusieurs biens en V1.
- Statut : brouillon, en service, cédé, mis au rebut ou totalement amorti.
- Pièce justificative : non stockée en V1 ; référence ou URL facultative seulement.

### 4.3. Catégories proposées

| Catégorie | Exemples | Durée suggérée, modifiable | Comptes indicatifs |
|---|---|---:|---|
| Matériel informatique | ordinateur, serveur, écran | 36 mois | 2183 / 28183 / 68112 |
| Mobilier | bureau, chaise, armoire | 60 à 120 mois | 2184 / 28184 / 68112 |
| Matériel de bureau | imprimante, équipement | 60 mois | 2183 / 28183 / 68112 |
| Véhicule | véhicule de société | 48 à 60 mois | 2182 / 28182 / 68112 |
| Logiciel acquis | licence immobilisable | 12 à 36 mois | 205 / 2805 / 68111 |
| Site / développement immobilisé | actif incorporel éligible | durée à confirmer | 205 / 2805 / 68111 |
| Agencements et installations | travaux, aménagement | 60 à 120 mois | 2181 / 28181 / 68112 |
| Autre | catégorie libre | durée obligatoire | comptes à saisir |

Les durées et comptes sont des suggestions éditables, jamais des décisions automatiques.

## 5. Reprise d'antériorité

Pour une immobilisation déjà en cours d'amortissement lors de son ajout :

- l'utilisateur saisit les données d'origine habituelles ;
- il active **« Reprise d'une immobilisation existante »** ;
- il renseigne une date de reprise ;
- il renseigne les amortissements cumulés comptabilisés à la veille de cette date ;
- l'application calcule la VNC d'ouverture = coût d'entrée - amortissements cumulés repris ;
- le cumul repris doit être compris entre 0 et la base amortissable ;
- l'application compare le cumul saisi au cumul théorique et affiche un écart informatif ;
- le cumul saisi prévaut pour l'ouverture, afin de respecter la comptabilité existante ;
- le reliquat amortissable est étalé sur la durée résiduelle du plan initial ;
- aucun rattrapage automatique n'est généré sans action explicite.

## 6. Cession et mise au rebut

### 6.1. Données de sortie

- Type : cession ou mise au rebut.
- Date de sortie.
- Prix de cession HT, TVA et TTC ; prix nul pour une mise au rebut par défaut.
- Notes.
- Référence de facture ou transaction de cession facultative.

### 6.2. Traitement

- L'amortissement est arrêté à la date de sortie, avec prorata temporis.
- VNC à la sortie = coût d'entrée - amortissements cumulés à la sortie.
- Résultat de cession indicatif = prix de cession HT - VNC à la sortie.
- Les impacts détaillés de TVA de régularisation, plus-values professionnelles et régimes spécifiques sont hors V1 ; une alerte demande validation par l'expert-comptable.
- Une sortie peut être annulée, ce qui restaure le plan antérieur.

## 7. Règles de calcul

Toutes les valeurs monétaires persistées et affichées sont arrondies au centime. Les calculs intermédiaires conservent leur précision et l'arrondi est appliqué à chaque dotation de période, avec ajustement sur la dernière période.

### 7.1. Formules

- TVA théorique = HT × taux de TVA.
- TVA récupérable = TVA facturée × coefficient de déduction.
- TVA non récupérable = TVA facturée - TVA récupérable.
- Coût d'entrée = HT + TVA non récupérable + frais accessoires immobilisables.
- Base amortissable = coût d'entrée - valeur résiduelle.
- Durée théorique = nombre de mois saisi à compter de la date de mise en service.
- Dotation d'une période = base amortissable × somme des fractions journalières couvertes par la période.
- Amortissements cumulés = reprise d'antériorité éventuelle + somme des dotations postérieures.
- VNC = coût d'entrée - amortissements cumulés.
- La VNC ne peut pas descendre sous la valeur résiduelle tant qu'aucune sortie n'est enregistrée.

### 7.2. Dates et bornes

- Les dates sont stockées au format YYYY-MM-DD sans heure.
- Le premier jour amorti est la date de mise en service.
- La fin théorique correspond à la veille de la date obtenue en ajoutant la durée en mois à la mise en service.
- Une date de sortie antérieure à la mise en service est interdite.
- Une date de reprise antérieure à la mise en service est interdite.

### 7.3. Cas particuliers

- Base amortissable nulle : fiche autorisée, sans dotation, avec avertissement.
- Montants négatifs : interdits.
- Durée inférieure à 1 mois : interdite.
- Modification d'un actif ayant une reprise d'antériorité : recalcul complet et avertissement sur l'écart avec le cumul repris.
- Suppression : confirmation obligatoire ; interdite si une sortie est liée, sauf suppression explicite de la sortie dans la même opération.

## 8. Interface utilisateur

### 8.1. Navigation

Ajouter un troisième onglet au dashboard :

1. Trésorerie & Prévisions ;
2. Notes de Frais & IK ;
3. Immobilisations & amortissements.

### 8.2. En-tête et indicateurs

Pour l'exercice fiscal sélectionné :

- coût d'entrée total des actifs en service ;
- dotation de l'exercice ;
- amortissements cumulés à la clôture ;
- VNC à la clôture ;
- nombre d'immobilisations actives ;
- nombre d'actifs totalement amortis ou sortis ;
- alertes : biens sous 500 € HT, données incohérentes, fin d'amortissement proche.

### 8.3. Registre des immobilisations

Table filtrable et triable avec :

- numéro ;
- libellé ;
- catégorie ;
- fournisseur ;
- dates d'achat et de mise en service ;
- coût d'entrée ;
- durée ;
- dotation de l'exercice ;
- cumul ;
- VNC ;
- statut ;
- actions modifier, sortir et supprimer.

Filtres : exercice, statut, catégorie, fournisseur et recherche textuelle.

### 8.4. Formulaire

Le formulaire est organisé en sections :

1. identification ;
2. achat et TVA ;
3. paramètres d'amortissement ;
4. reprise d'antériorité ;
5. source d'achat et liens Qonto ;
6. aperçu du plan avant enregistrement.

Le sélecteur de source propose une transaction Qonto directe, une note de frais ou une facture fournisseur. Ces trois choix sont mutuellement exclusifs. Pour une note de frais, l'interface affiche le collaborateur, le montant professionnel, la TVA déductible et le statut de remboursement. Lorsqu'une transaction ou une note de frais constitue la source, une facture fournisseur peut être associée séparément comme pièce comptable.

Les sources peuvent être sélectionnées en nombre pour gérer un paiement fractionné ou un équipement en kit acheté auprès de plusieurs fournisseurs. Aucun minimum unitaire spécifique n'est imposé aux notes de frais ou factures ; le seuil indicatif d'immobilisation de 500 € HT reste une alerte non bloquante appliquée au coût total de l'actif.

Les calculs sont prévisualisés instantanément côté interface puis recalculés et validés côté serveur.

### 8.5. Détail et plan

La fiche détail affiche :

- les données sources ;
- un résumé comptable ;
- le plan annuel par exercice fiscal ;
- le plan mensuel ;
- l'historique de sortie ;
- les alertes et hypothèses appliquées.

### 8.6. Export CSV

Deux exports UTF-8 avec séparateur point-virgule :

- **Registre** : une ligne par immobilisation avec les valeurs à la date ou clôture sélectionnée.
- **Plan** : une ligne par immobilisation et par mois, comprenant exercice, période, dotation, cumul et VNC.

Les montants utilisent deux décimales et les dates le format ISO YYYY-MM-DD.

## 9. Modèle de données proposé

### 9.1. Table `fixed_assets`

- `id` : identifiant texte.
- `asset_number` : numéro interne unique.
- `label`, `description`, `category`, `supplier_name`.
- `purchase_date`, `service_date`.
- `invoice_number`, `supplier_invoice_id`, `document_url`.
- `source_type` : `transaction`, `expense_item` ou `none`.
- `source_transaction_id` et `source_expense_item_id`, avec contrainte métier garantissant qu'un seul des deux est renseigné conformément à `source_type`.
- `amount_ht_cents`, `vat_amount_cents`, `amount_ttc_cents`.
- `vat_rate`, `vat_deductible_rate`.
- `incidental_costs_cents`, `acquisition_cost_cents`.
- `residual_value_cents`, `depreciable_base_cents`.
- `depreciation_method` : `straight_line` en V1.
- `depreciation_duration_months`.
- `asset_account`, `depreciation_account`, `expense_account`.
- `is_opening_balance`, `opening_date`, `opening_accumulated_depreciation_cents`.
- `status` : `draft`, `in_service`, `disposed`, `scrapped`, `fully_depreciated`.
- `created_at`, `updated_at`.

Les montants sont stockés en centimes entiers pour éviter les erreurs binaires. Les champs calculés persistés servent à l'audit et sont recalculés de façon déterministe lors d'une modification.

### 9.2. Table `fixed_asset_disposals`

- `id`, `fixed_asset_id` unique.
- `type` : `sale` ou `scrap`.
- `disposal_date`.
- `sale_amount_ht_cents`, `sale_vat_amount_cents`, `sale_amount_ttc_cents`.
- `customer_invoice_id`, `transaction_id`, `notes`.
- `created_at`, `updated_at`.

### 9.3. Échéances calculées

Les échéances mensuelles et annuelles ne sont pas persistées en V1 : elles sont calculées à partir de la fiche, de la reprise et de la sortie. Cela évite les divergences après modification des paramètres ou de la clôture fiscale.

## 10. Architecture technique proposée

- Schéma Drizzle et initialisation SQLite additive dans la couche base de données existante.
- Actions serveur séparées pour lecture, création, modification, suppression, sortie et annulation de sortie.
- Module de calcul pur et testable pour le coût d'entrée, les échéances, la reprise, la sortie et les agrégats par exercice.
- Composant principal d'onglet, tableau du registre, formulaire modal, modal de sortie et vue du plan.
- Calcul serveur faisant autorité ; calcul client réservé à l'aperçu.
- Réutilisation des dates d'exercice configurées dans l'application.
- Intégration de la dotation au calcul de résultat estimé, sans impact sur la projection de trésorerie.

Avant l'implémentation, la documentation locale de la version installée de Next.js devra être consultée pour les conventions applicables aux actions serveur, à la mise en cache et à la revalidation.

## 11. Validation et sécurité métier

- Validation systématique côté serveur, même si le formulaire valide côté client.
- Identifiants de facture, transaction et note de frais vérifiés avant liaison.
- Une immobilisation peut avoir plusieurs sources, mais toutes doivent appartenir à la même famille : transactions Qonto, notes de frais ou factures fournisseur.
- Une transaction ou une note de frais ne peut être la source que d'une seule immobilisation en V1 ; la ventilation d'une source entre plusieurs immobilisations est hors périmètre.
- Le lien facultatif vers une facture fournisseur est indépendant de la source d'achat, mais l'application avertit si les montants ou références sont incohérents.
- Les erreurs métier sont retournées sous une forme exploitable par l'interface.
- Toute mutation provoque la revalidation du dashboard.
- Les suppressions sont physiques en V1, avec confirmation forte. Un journal d'audit complet est hors périmètre.

## 12. Tests d'acceptation

### 12.1. Calculs

- Actif de 1 200 € HT, TVA entièrement récupérable, valeur résiduelle nulle, durée 12 mois : base de 1 200 € et cumul final exact de 1 200 €.
- TVA non récupérable : elle est intégrée au coût d'entrée.
- TVA récupérable à 50 % : seule la moitié non récupérable entre dans le coût.
- Mise en service en cours de mois : première et dernière périodes calculées au prorata journalier.
- Exercice décalé : ventilation correcte entre deux exercices.
- Année bissextile : utilisation de 366 jours pour les jours concernés.
- Valeur résiduelle : VNC finale égale à cette valeur.
- Reprise : le cumul saisi prévaut et le reliquat atteint la VNC finale attendue.
- Cession anticipée : aucune dotation après la date de sortie.
- Somme des échéances : égale à la base amortissable au centime près.

### 12.2. Interface et données

- Création, modification, suppression et consultation d'une immobilisation.
- Alerte non bloquante sous le seuil configuré.
- Filtres et recherche du registre.
- Export CSV conforme aux données affichées.
- Aucun changement de trésorerie après création ou recalcul d'un plan.
- Rattachement exclusif réussi à une transaction directe ou à une note de frais.
- Impossibilité de rattacher la même source à deux immobilisations ou les deux types de source à une fiche.
- Dotation incluse une seule fois dans le résultat estimé lorsqu'une transaction, une note de frais ou une facture fournisseur est liée.
- Une note de frais immobilisée conserve son montant remboursable et son suivi de remboursement, mais sa charge professionnelle est neutralisée au profit de la dotation.
- Messages explicites pour dates, montants, durée ou cumul invalides.

## 13. Hors périmètre V1

- Amortissement dégressif, exceptionnel, par unités d'œuvre ou composant complexe.
- Réévaluation, dépréciation et reprise de dépréciation.
- Génération d'écritures comptables ou export FEC.
- Comptabilisation automatique des plus ou moins-values de cession.
- Régularisations complexes de TVA sur immobilisations.
- Gestion fiscale particulière des véhicules et plafonds d'amortissement.
- Stockage de fichiers justificatifs.
- Synchronisation automatique complète depuis Qonto et détection automatique des immobilisations.
- Journal d'audit immuable.

## 14. Décisions restant à valider avant développement

1. Confirmer la convention de prorata : jours réels sur 365/366, ou convention comptable de 360 jours.
2. Confirmer que les catégories, durées et comptes proposés conviennent au plan comptable de l'entreprise.
3. Confirmer l'intégration au résultat estimé du dashboard dès la V1, avec neutralisation de la transaction, de la note de frais ou de la facture fournisseur liée pour éviter le double comptage.
4. Confirmer que la suppression physique avec confirmation est acceptable, plutôt qu'un archivage obligatoire.
5. Confirmer que les exports CSV suffisent, sans export d'écritures comptables.

Aucun développement ne doit commencer avant validation explicite de ces spécifications et des cinq décisions ci-dessus.
