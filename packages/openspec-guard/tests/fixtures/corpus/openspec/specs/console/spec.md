# console Specification

## Purpose

Superviser l'exploitation depuis une console interne.

## Requirements

### Requirement: Acces reserve aux comptes privilegies

Le systeme SHALL restreindre la console aux comptes privilegies, et NE SHALL PAS
faire confiance a un drapeau transmis par le client.

#### Scenario: Visiteur anonyme

- **WHEN** une requete sans session valide atteint une page de la console
- **THEN** le systeme redirige vers `/login` sans rendre de donnee admin

#### Scenario: Staff avec le drapeau admin

- **WHEN** un utilisateur privilegie atteint la console
- **THEN** l'acces est accorde

### Requirement: Journal des actions de moderation

Le systeme SHALL journaliser chaque action de moderation.

#### Scenario: Visiteur anonyme

- **WHEN** un visiteur anonyme tente une action de moderation
- **THEN** rien n'est journalise et l'action est refusee
