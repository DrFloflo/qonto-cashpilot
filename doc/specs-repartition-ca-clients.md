# Spécifications — Répartition du chiffre d’affaires par client

## 1. Statut du document

- **Phase** : spécifications validées, prêtes pour développement.
- **Fonctionnalité** : nouvel onglet de consultation du poids de chaque client dans le chiffre d’affaires encaissé d’une année civile.
- **Source disponible** : factures clients Qonto synchronisées dans l’application.
- **Décisions ouvertes** : aucune pour le périmètre V1 décrit dans ce document.

## 2. Objectifs

Ajouter au dashboard un onglet **« CA par client »** permettant de :

- connaître le chiffre d’affaires total de la période sélectionnée ;
- mesurer le montant et le pourcentage de chiffre d’affaires représentés par chaque client ;
- classer les clients du plus important au moins important ;
- visualiser la concentration du chiffre d’affaires sans seuil d’alerte automatique ;
- consulter les factures et avoirs constituant le chiffre d’affaires encaissé d’un client ;
- afficher séparément les clients dont le CA net est négatif.

## 3. Périmètre fonctionnel V1

### 3.1. Navigation

Ajouter un quatrième onglet au dashboard existant :

1. Trésorerie & Prévisions ;
2. Notes de Frais & IK ;
3. Immobilisations & amortissements ;
4. CA par client.

L’onglet est accessible depuis la barre de navigation principale et conserve le style visuel des onglets existants.

### 3.2. Période analysée

La période est une **année civile** :

- l’année civile courante est sélectionnée par défaut ;
- pour l’année courante, la période va du 1er janvier à la date du jour ;
- un sélecteur permet de consulter les années civiles précédentes présentes dans les données ;
- pour une année antérieure, la période va du 1er janvier au 31 décembre ;
- le rattachement à une année repose sur la date d’encaissement définie à la section suivante ;
- les factures et paiements futurs ne sont jamais comptés.

### 3.3. Définition du chiffre d’affaires

Le CA affiché est un **CA HT encaissé** calculé à partir des factures clients Qonto :

- seules les factures au statut payé sont incluses ;
- les factures impayées, en retard, en attente ou annulées sont exclues ;
- date de rattachement prioritaire : date de paiement de la facture ;
- si une facture est marquée payée mais ne possède pas de date de paiement, sa date d’émission devient la date de rattachement de secours ;
- les factures futures et flux futurs sont exclus ;
- les transactions bancaires créditrices non rattachées à une facture sont exclues afin d’éviter tout double comptage et de conserver une source documentaire justifiable ;
- les avoirs sont déduits du CA net s’ils sont disponibles et identifiables dans les données Qonto ;
- un client peut par conséquent présenter un CA net négatif.

### 3.4. Identification et regroupement des clients

En V1, les factures et avoirs sont regroupés par client :

- utiliser en priorité l’identifiant stable du client fourni par Qonto, s’il est disponible ;
- conserver le nom commercial du client pour l’affichage ;
- en l’absence d’identifiant, appliquer un nom normalisé : espaces superflus supprimés, casse et accents neutralisés pour le regroupement ;
- afficher le nom le plus récent ou le plus fréquent ;
- classer les documents sans client exploitable dans **« Client non renseigné »** ;
- permettre à l’utilisateur de fusionner manuellement plusieurs identités ou variantes de noms sous un client canonique ;
- conserver ces règles de fusion lors des synchronisations ultérieures ;
- permettre d’annuler une fusion sans supprimer ni modifier les factures sources.

Le schéma actuel ne conserve que le nom du client dans une colonne dédiée. Une évolution additive du modèle est donc nécessaire pour stocker l’identifiant Qonto, les clients canoniques et les correspondances de fusion manuelle.

## 4. Règles de calcul

Pour chaque client `c` sur l’année civile `A` :

- `CA net client(c, A) = factures payées HT - avoirs HT rattachés au client sur A` ;
- `CA net total(A) = somme des CA nets de tous les clients sur A` ;
- `Part client(c, A) = CA net client(c, A) / CA net total(A) × 100`.

Règles complémentaires :

- les calculs monétaires sont effectués au centime ;
- les montants sont affichés en euros avec deux décimales ;
- les pourcentages sont calculés à partir des montants non arrondis, puis affichés avec une décimale ;
- la somme des pourcentages affichés peut légèrement différer de 100 % du fait des arrondis ;
- si le CA net total est nul, chaque part vaut 0 % et l’interface présente un état explicite ;
- les clients dont le CA net est nul restent masqués par défaut ;
- les clients dont le CA net est négatif sont conservés et affichés avec un montant et une part négatifs dans le tableau ;
- le panier moyen est calculé sur les factures payées avant déduction des avoirs et le montant des avoirs est présenté séparément pour éviter une moyenne trompeuse.

## 5. Interface utilisateur proposée

### 5.1. En-tête et indicateurs

Afficher en haut de l’onglet :

- année civile sélectionnée ;
- CA net encaissé HT ;
- montant total HT des avoirs déduits ;
- nombre de clients avec un CA net non nul ;
- poids du premier client ;
- poids cumulé des trois premiers clients.

Aucun seuil ni message d’alerte de concentration n’est prévu en V1.

### 5.2. Visualisation

La visualisation V1 est un **diagramme en anneau** :

- une portion par client principal ;
- nom, CA net HT et pourcentage dans l’infobulle et la légende ;
- classement par CA net décroissant ;
- affichage des 10 premiers clients dont le CA net est strictement positif ;
- regroupement des autres clients positifs dans une portion **« Autres clients »** ;
- exclusion de l’anneau des clients dont le CA net est nul ou négatif ;
- affichage des clients négatifs dans un encart séparé **« CA net négatif »** avec leur montant ;
- conservation de tous les clients dans le tableau exhaustif.

Le dénominateur des pourcentages affichés dans l’anneau reste le CA net total incluant les clients négatifs. La légende indique donc clairement que l’anneau ne matérialise que les clients positifs et peut ne pas représenter visuellement 100 % du total net.

### 5.3. Tableau détaillé

Afficher une ligne par client avec les colonnes suivantes :

- rang ;
- client canonique ;
- CA net encaissé HT ;
- part du CA net total ;
- nombre de factures payées ;
- montant HT des avoirs ;
- panier moyen HT des factures payées ;
- dernier encaissement retenu.

Fonctions proposées :

- tri par CA, part, nom, nombre de factures ou dernière facture ;
- recherche par nom de client ;
- clic sur une ligne pour ouvrir le détail ;
- pagination ou défilement selon le volume réel de clients.

### 5.4. Détail d’un client

Un panneau ou une fenêtre modale affiche :

- nom canonique du client et variantes fusionnées ;
- CA net encaissé HT et part du CA ;
- nombre de factures payées et nombre d’avoirs ;
- liste des documents inclus avec numéro, date d’émission, date de paiement effective ou de secours, statut, montant HT, TVA et TTC ;
- sous-totaux des factures, des avoirs et total net ;
- indication explicite lorsqu’une date d’émission a remplacé une date de paiement absente.

### 5.5. États particuliers

Prévoir les états suivants :

- aucune facture client synchronisée ;
- aucune facture éligible sur la période ;
- synchronisation Qonto non configurée ;
- factures avec client non renseigné ;
- données client ambiguës ou variantes de noms en attente de fusion ;
- CA net total nul ou négatif ;
- clients avec CA net négatif ;
- erreur de chargement.

## 6. Données et architecture proposées

### 6.1. Données existantes utilisables

Les factures clients synchronisées fournissent déjà :

- numéro de facture ;
- nom du client ;
- statut ;
- date d’émission ;
- date d’échéance ;
- date de paiement ;
- montant HT ;
- TVA ;
- montant TTC ;
- charge utile Qonto brute.

### 6.2. Évolution de synchronisation recommandée

Pour fiabiliser le regroupement, ajouter lors de la synchronisation :

- identifiant stable du client Qonto, lorsqu’il existe ;
- nom original et nom normalisé ;
- nature du document ou indicateur d’avoir, si exposé par Qonto ;
- identifiant de la facture d’origine d’un avoir, s’il est exposé ;
- devise, si plusieurs devises sont possibles.

Ajouter également un modèle persistant de fusion manuelle comprenant au minimum :

- une identité client canonique et son libellé d’affichage ;
- les identités Qonto et variantes normalisées qui lui sont rattachées ;
- les dates de création et de modification de la règle ;
- une suppression ou annulation de règle sans modification des documents sources.

La migration doit être additive et préserver les factures déjà synchronisées. Pour les anciennes lignes, un mécanisme de repli sur le nom normalisé est utilisé jusqu’à la prochaine synchronisation.

### 6.3. Calcul serveur

Créer une fonction métier pure dédiée qui :

1. reçoit les factures et les bornes de période ;
2. filtre les documents éligibles ;
3. regroupe les documents par identité client ;
4. calcule les montants, pourcentages et indicateurs ;
5. renvoie une structure typée indépendante de l’interface.

Le calcul est réalisé côté serveur à partir des données SQLite. L’interface reçoit uniquement les agrégats et les lignes de détail nécessaires.

### 6.4. Intégration au dashboard

Deux options techniques sont possibles :

- inclure les agrégats dans les données initiales du dashboard ;
- charger les agrégats à l’ouverture de l’onglet via une action serveur dédiée.

Proposition : chargement via une action dédiée à l’ouverture de l’onglet, afin de ne pas alourdir le chargement initial du dashboard et de faciliter ultérieurement le changement de période.

## 7. Critères d’acceptation

La fonctionnalité sera acceptée si :

1. un nouvel onglet « CA par client » est visible et utilisable sur mobile et ordinateur ;
2. l’année civile courante est sélectionnée par défaut et les années précédentes sont consultables ;
3. le CA net total correspond aux factures payées HT diminuées des avoirs HT sur l’année retenue ;
4. chaque document éligible est compté une fois et une seule ;
5. les factures impayées, en retard, en attente ou annulées sont exclues ;
6. une facture payée sans date de paiement est rattachée à sa date d’émission et signalée comme telle dans son détail ;
7. les clients sont regroupés selon leur identité Qonto, le repli normalisé et les fusions manuelles persistantes ;
8. une fusion peut être annulée sans altérer les factures et avoirs sources ;
9. le montant et le pourcentage de chaque client sont exacts, y compris lorsqu’ils sont négatifs ;
10. les clients sont triés par CA net décroissant par défaut ;
11. le diagramme et le tableau proviennent du même résultat de calcul ; les clients négatifs sont absents de l’anneau et présents dans l’encart dédié ainsi que dans le tableau ;
12. le détail d’un client justifie son montant par les factures et avoirs inclus ;
13. l’état sans données ou avec CA net nul ne provoque ni erreur ni division par zéro ;
14. une synchronisation Qonto rafraîchit les données de l’onglet sans perdre les fusions manuelles ;
15. aucune transaction bancaire non documentée par une facture payée n’est présentée comme du CA.

## 8. Tests prévus

### 8.1. Tests unitaires

- bornes exactes de chaque année civile ;
- inclusion des factures payées et exclusion des autres statuts ;
- repli sur la date d’émission quand la date de paiement manque ;
- regroupement par identifiant client ;
- repli sur le nom normalisé ;
- application et annulation des fusions manuelles ;
- calcul du CA net par client et du CA net total ;
- calcul des pourcentages positifs et négatifs ;
- zéro facture, CA total nul et CA total négatif ;
- déduction et rattachement des avoirs ;
- classement et regroupement « Autres clients » ;
- arrondis monétaires et pourcentages.

### 8.2. Tests d’intégration

- lecture des factures depuis SQLite ;
- résultat de l’action serveur ;
- rafraîchissement après synchronisation ;
- compatibilité avec les données historiques ne possédant pas encore d’identifiant client.

### 8.3. Tests d’interface

- rendu des indicateurs, du graphique et du tableau ;
- recherche, tri et ouverture du détail ;
- états vide, chargement et erreur ;
- rendu responsive.

## 9. Hors périmètre proposé pour la V1

- prévision de CA futur par client ;
- objectifs commerciaux par client ;
- marge ou rentabilité par client ;
- segmentation commerciale avancée ;
- consolidation de plusieurs devises ;
- rapprochement automatique complet entre factures et transactions bancaires ;
- export CSV ou PDF.

## 10. Décisions validées avant développement

1. La période est l’année civile, avec l’année courante sélectionnée par défaut.
2. Le CA est le montant HT encaissé, rattaché en priorité à la date de paiement.
3. Une facture marquée payée sans date de paiement est rattachée à sa date d’émission.
4. Les factures impayées, en retard, en attente et annulées sont exclues.
5. Un sélecteur permet de consulter les années civiles précédentes.
6. La visualisation principale est un diagramme en anneau.
7. Le tableau est exhaustif et un détail des factures est disponible par client.
8. Les variantes d’un client peuvent être fusionnées manuellement et durablement.
9. Aucun seuil d’alerte de concentration n’est affiché.
10. Aucun export CSV n’est prévu en V1.
11. Les avoirs sont déduits du CA net.
12. Les clients dont le CA net est négatif restent visibles avec un montant négatif.
13. Les clients négatifs sont exclus du diagramme en anneau, affichés dans un encart séparé **« CA net négatif »** et conservés dans le tableau exhaustif.
