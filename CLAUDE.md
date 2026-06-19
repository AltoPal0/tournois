# Architecture du projet — Tournois de Padel

## Stack

React + TypeScript + Vite, Tailwind CSS, Zustand (stores), Supabase (DB + realtime), React Flow (éditeur de graphe).

---

## Système de templates visuels

### Principe fondamental

Chaque tournoi a un `playerTemplate: PlayerTemplate` dans `TournamentConfig`. Ce template gouverne **l'intégralité** de l'interface vue par les joueurs. Toute interface visible dans `TournamentMatchesPage` doit être template-aware.

```ts
export type PlayerTemplate = 'default' | 'slick-dark' | 'palm-springs' | 'green-turf'
```

### Deux mécanismes de theming

**1. `getTheme(template)` — `src/lib/templateTheme.ts`**

Retourne un objet `TemplateTheme` avec des tokens CSS (couleurs en string). À utiliser via `style={{}}` inline pour tout composant overlay/sheet (fond sombre, éléments flottants).

```ts
const theme = getTheme(template)
// → theme.bg, theme.accent, theme.accentText, theme.textPrimary, theme.textSecondary,
//   theme.textMuted, theme.inputBg, theme.itemBg, theme.itemBgActive, theme.divider, theme.useClip
```

Utilisé par : `PlayerSelectSheet`, `OnboardingOverlay`, `PlayerAssignmentOverlay`, `PlayerManagementPanel`, `AmericanaSingleRosterOverlay`, et les éléments inline de `TournamentMatchesPage` (modale, pull-to-refresh, spinner).

**2. Dispatch par composant — classes Tailwind conditionnelles**

Pour les composants qui ont une structure HTML différente selon le template (pas juste des couleurs), chaque template a sa propre fonction de rendu. Le composant parent dispatche.

```tsx
// Exemple dans PhaseSection
const MatchCardComponent =
  template === 'slick-dark' ? MatchCardSlickDark :
  template === 'palm-springs' ? MatchCardPalmSprings :
  template === 'green-turf' ? MatchCardGreenTurf :
  MatchCardDefault
```

Utilisé par : `PhaseSection` (cards de matchs), `StandingsTable`, `ScoreInput`, `PhaseNav`, `NextMatchBanner`.

### Règle : tout ajout doit couvrir les 4 templates

Quand on ajoute un composant visible dans la page joueur :
- S'il est un overlay/sheet → utiliser `getTheme(template)`
- S'il a un rendu structurellement différent → créer une variante par template ou brancher conditionnellement les classes
- Ne jamais hardcoder `bg-white`, `text-gray-900`, `bg-navy-900`, `text-padel-gold`, etc. dans un composant visible en session

### Composants template-aware (inventaire complet)

| Composant | Mécanisme |
|-----------|-----------|
| `TournamentMatchesPage` — top bar, burger, modale, spinner | conditionnel inline + `getTheme` |
| `PhaseSection` — match cards | dispatch vers 4 variantes |
| `StandingsTable` | dispatch vers 4 variantes |
| Table standings americana inline (dans `PhaseSection`) | conditionnel inline |
| `ScoreInput` | dispatch vers 4 variantes |
| `NextMatchBanner` | `getNavStyles`-like switch |
| `PhaseNav` | switch `getNavStyles` |
| `PlayerSelectSheet` | `getTheme` |
| `OnboardingOverlay` | `getTheme` |
| `AmericanaSingleRosterOverlay` | `getTheme` |
| `PlayerAssignmentOverlay` | `getTheme` |
| `PlayerManagementPanel` | `getTheme` |

### `slick-dark` — spécificités visuelles

- Coins coupés (`clipPath: polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)`) sur les tableaux
- Bordure jaune 1px sur ces mêmes tableaux : wrapper jaune (`#D4E800`, padding `1px`) + inner identique clip
- Accents jaune chartreuse `#D4E800`, fond `#062E38` / `#0E6070`
- Avatar joueur en forme de parallélogramme (`clipPath: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)`)

---

## Phases — boîtes noires avec entrées/sorties

### Modèle conceptuel

Le tournoi est un **graphe orienté acyclique** de phases (`TournamentGraph`). Chaque phase est un nœud avec :
- **`inputCount`** : nombre de slots d'entrée (équipes ou joueurs entrants)
- **`outputs`** : tableau de sorties nommées et ordonnées (ex. "1er", "2e", "3e")
- Des **arêtes** qui relient la sortie `rank N` d'une phase à l'entrée `slot M` d'une autre

Les arêtes sont des **promesses de provenance** : au moment de générer les matchs, les labels "Vainqueur Demi-finale 1 de Poule A" sont calculés depuis ces arêtes. Quand les scores tombent, `computeAdvancements` remplace les labels par de vrais `equipe_id`.

### Taxonomie des types de phases

#### Phases visibles — génèrent des matchs affichés aux joueurs

| Type | Description | Inputs | Génération matchs | Identité équipes dans matchs |
|------|-------------|--------|-------------------|-------------------------------|
| `round_robin` | Poule complète, algorithme du cercle | équipes | statique, tous à la génération | `equipe_id` (null si root, assigné ensuite) |
| `elimination` | Bracket K.O. avec byes | équipes | statique, tous rounds | `equipe_id` |
| `americano` | Rotation round-robin N rounds | équipes | statique | `equipe_id` |
| `tournante_libre` | Format suisse, assignation manuelle par round | équipes | statique (slots vides) | `equipe_id` (assigné manuellement) |
| `match_simple` | Un seul match entre 2 équipes | 2 équipes | statique | `equipe_id` |
| `americana_single` | Mexicano individuel, pairing fair-play | joueurs (noms) | **dynamique par batch** (3 matchs à la fois) | `equipe_id` (équipes temporaires créées en DB via `upsertTeam`) |
| `americana_weighted` | Mexicano pondéré par rang | joueurs (noms) | statique ou **dynamique round par round** si `liveGeneration` | **`equipe_label` uniquement** (`equipe1_id = null` toujours) |

#### Phases invisibles — utilitaires sans matchs, non affichées

| Type | Rôle | Comportement |
|------|------|-------------|
| `super_americana` | Placeholder/variante historique | Skippée dans `generateAllMatches` et le scheduling |
| `best_of` | Agrège les résultats de plusieurs matchs pour décider l'avancement | Invisible dans le frontend joueur, traitée dans `computeAdvancements` |
| `team_builder` | Constitue des équipes à partir de joueurs individuels | Pas de matchs ; les slots de sortie alimentent des phases en aval |
| `team_splitter` | Dissout des équipes en joueurs individuels | Pas de matchs ; reçoit des équipes, envoie des joueurs en aval |

Ces phases sont **exclues** systématiquement de :
- `generateAllMatches` (guard en début de boucle)
- `assignScheduleToMatches` (skip dans `byDepth`)
- `computeInputSlotPairs` (retourne `[]` ou `pairs` vide)
- Le frontend joueur (`PhaseSection` ne les reçoit jamais comme `activePhase`)

---

## Structure d'un match (`Match`)

```ts
interface Match {
  equipe1_id: string | null   // UUID d'une équipe en DB (tt_teams)
  equipe2_id: string | null   // null si phase root ou americana_weighted
  equipe1_label: string | null // Label textuel "Alice / Bob" (americana_weighted)
                               // ou "Vainqueur Demi-finale..." (phases non-root)
  equipe2_label: string | null
  round: number | null         // Numéro du round dans la phase
  ordre: number                // Ordre global d'affichage dans la phase
}
```

### Règle critique : deux régimes d'identité d'équipe

**Régime `equipe_id`** (toutes les phases sauf `americana_weighted`) :
- Les équipes existent dans `tt_teams` (joueur1 + joueur2)
- `teamsMap` est populée depuis Supabase au chargement
- L'identité joueur = trouver son équipe dans `teamsMap` via `findMyTeam`
- Le highlight de "mon match" = `match.equipe1_id === myTeamId || match.equipe2_id === myTeamId`

**Régime `equipe_label`** (`americana_weighted`) :
- `equipe1_id` et `equipe2_id` sont **toujours `null`**
- Les équipes sont dans `equipe1_label = "Alice / Bob"` (noms séparés par ` / `)
- `teamsMap` est vide → `PlayerSelectSheet` doit recevoir `extraPlayers`
- Les joueurs sont résolus via `playerNames` (config de phase) → `extraPlayers` (Supabase query par prenom)
- L'identité joueur = `identity.prenom` dans les labels : `label.split('/').some(n => n.trim() === prenom)`
- `myTeamId` sera toujours `null` pour ces phases → utiliser `myPlayerName` à la place

---

## Identité joueur et highlight

### Chaîne de propagation

```
identity.prenom / identity.joueurId (localStorage)
  → myTeamId (via findMyTeam sur teamsMap) — régime equipe_id
  → myPlayerName (identity.prenom) — régime equipe_label
    → phaseHasMyMatches (bool)
    → displayMatches (filtre)
    → nextMatch (bannière)
    → isMyMatch dans chaque MatchCard (highlight visuel)
    → phaseHasMyMatches dans PhaseSection (bouton filtre)
```

### Props à transmettre pour le highlight complet

`TournamentMatchesPage` → `PhaseSection` :
- `myTeamId` (pour régime equipe_id)
- `myPlayerName` (pour régime equipe_label)

`PhaseSection` → chaque `MatchCard*` via `cardProps` :
- `myTeamId`
- `myPlayerName`

### `PlayerSelectSheet` — source des joueurs

Merge de deux sources (dédupliquées) :
1. `teamsMap` → itère `joueur1` + `joueur2` de chaque équipe (phases team-based)
2. `extraPlayers` → joueurs resolus depuis `playerNames` (americana_single + americana_weighted)

Si le tournoi n'a que des phases `americana_weighted`, `teamsMap` sera vide et seul `extraPlayers` alimente la liste.

---

## Génération de matchs — flux général

```
generateAllMatches(graph)
  → topologicalSort(graph)           # racines en premier
  → pour chaque nœud (sauf phases invisibles) :
      provenances = buildProvenanceMap()   # labels depuis arêtes entrantes
      isRoot = aucune arête entrante       # si root, labels = null (assignation manuelle)
      → generateXxxMatches(node, ...)
  → assignScheduleToMatches()         # pistes + horaires si configurés
```

Pour `americana_single` : matchs générés par `generateAmericanaSingleBatch` (store), déclenchés par bouton ou automatiquement quand le batch précédent est terminé.

Pour `americana_weighted` en mode `liveGeneration` : round 1 généré à la création, rounds suivants via `generateWeightedAmericanoNextRound` (bouton "Générer le round suivant").

---

## Avancement inter-phases

`computeAdvancements(completedMatchId, allMatches, graph)` est appelé après chaque saisie de score. Il calcule quelles équipes avancent dans les matchs suivants et retourne des `AdvancementUpdate[]` à appliquer en DB.

Fonctionne pour : `round_robin`, `tournante_libre`, `americano`, `elimination`, `match_simple`.  
Ne fonctionne **pas** pour `americana_single` (terminaison manuelle) ni `americana_weighted` (pas d'equipe_id).

---

## Conventions à respecter pour tout nouvel ajout

### Ajouter un nouveau type de phase

1. Ajouter la valeur dans `PhaseType` (`src/types/tournament.ts`)
2. Décider : phase **visible** ou **invisible** ?
   - Invisible → ajouter les guards dans `generateAllMatches`, `assignScheduleToMatches`, `computeInputSlotPairs`, et dans le frontend pour ne jamais la passer comme `activePhase`
   - Visible → implémenter `generateXxxMatches` + ajouter dans le switch de `generateAllMatches`
3. Décider : régime **equipe_id** ou **equipe_label** ?
   - Si `equipe_label` → `equipe1_id` doit être `null` dans les inserts, et s'assurer que `myPlayerName` est propagé pour le highlight
4. Implémenter les 4 variantes dans `PhaseSection` (MatchCard) et `StandingsTable`
5. Ajouter la gestion dans `PhaseConfigPanel` (éditeur)

### Ajouter un composant visible dans la page joueur

1. Accepter `template?: PlayerTemplate` en prop
2. Utiliser `getTheme(template)` pour les overlays/sheets
3. Brancher conditionnellement ou dispatcher pour les composants avec rendu structurel différent
4. Ne jamais hardcoder de couleurs de marque (`#0E6070`, `bg-navy-900`, `text-padel-gold`, etc.)
5. Vérifier visuellement les 4 templates avant de considérer la feature terminée

### Ne pas faire

- Créer une phase visible sans ses 4 variantes de MatchCard
- Générer des matchs avec `equipe_label` sans gérer `myPlayerName` pour le highlight
- Passer uniquement `teamsMap` à `PlayerSelectSheet` si la phase peut n'avoir que des joueurs nommés
- Utiliser `PhaseNav` (composant mort, jamais importé — la navigation est dans le burger menu)
