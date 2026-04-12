import type { TournamentGraph, SerializedNode, Match } from '../types/tournament'

type NewMatch = Omit<Match, 'id' | 'created_at'>

interface ProvenanceSlot {
  inputIndex: number
  label: string
}

// ---------------------------------------------------------------------------
// Tri topologique (Kahn) — phases racine d'abord
// ---------------------------------------------------------------------------

export function topologicalSort(graph: TournamentGraph): SerializedNode[] {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, Set<string>>()

  for (const n of graph.nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, new Set())
  }

  for (const e of graph.edges) {
    adj.get(e.source)!.add(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: SerializedNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(nodeMap.get(id)!)
    for (const target of adj.get(id)!) {
      const newDeg = inDegree.get(target)! - 1
      inDegree.set(target, newDeg)
      if (newDeg === 0) queue.push(target)
    }
  }

  return sorted
}

// ---------------------------------------------------------------------------
// Map de provenance : pour chaque nœud cible, les labels de provenance par slot
// ---------------------------------------------------------------------------

function buildProvenanceMap(
  graph: TournamentGraph,
): Map<string, ProvenanceSlot[]> {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  const map = new Map<string, ProvenanceSlot[]>()

  for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source)
    if (!sourceNode) continue

    const outputIndex = parseHandleIndex(edge.sourceHandle)
    const inputIndex = parseHandleIndex(edge.targetHandle)
    const output = sourceNode.data.config.outputs.find(
      (o) => o.rank === outputIndex,
    )
    const label = output
      ? `${output.label} de ${sourceNode.data.config.name}`
      : `#${outputIndex} de ${sourceNode.data.config.name}`

    const slots = map.get(edge.target) ?? []
    slots.push({ inputIndex, label })
    map.set(edge.target, slots)
  }

  return map
}

function parseHandleIndex(handle: string): number {
  // "in-3" → 3, "out-1" → 1
  const parts = handle.split('-')
  return parseInt(parts[parts.length - 1], 10)
}

// ---------------------------------------------------------------------------
// Round Robin : algorithme du cercle (circle method)
// Chaque tour, chaque équipe joue exactement une fois → repos garanti entre
// les matchs, et temps d'attente minimal.
// ---------------------------------------------------------------------------

/**
 * Algorithme du cercle : fixe la dernière équipe, fait tourner les autres.
 * Retourne un tableau de tours, chaque tour contenant des paires [slot1, slot2].
 * Si N est impair, un bye est ajouté puis filtré.
 */
function circleSchedule(n: number): [number, number][][] {
  const isOdd = n % 2 !== 0
  const total = isOdd ? n + 1 : n
  const fixed = total // dernière équipe fixée
  const rotating = Array.from({ length: total - 1 }, (_, i) => i + 1)

  const rounds: [number, number][][] = []

  for (let r = 0; r < total - 1; r++) {
    const round: [number, number][] = []
    // Match fixe : fixed vs premier du rotating
    round.push([fixed, rotating[0]])
    // Paires restantes : de l'extérieur vers l'intérieur
    for (let i = 1; i < total / 2; i++) {
      round.push([rotating[i], rotating[total - 1 - i]])
    }
    rounds.push(round)
    // Rotation : décaler d'un cran
    rotating.push(rotating.shift()!)
  }

  // Filtrer les byes (équipe > n) si N impair
  if (isOdd) {
    return rounds.map((round) =>
      round.filter(([a, b]) => a <= n && b <= n),
    )
  }
  return rounds
}

function generateRoundRobinMatches(
  node: SerializedNode,
  provenances: ProvenanceSlot[],
  isRoot: boolean,
  tournamentId: string,
): NewMatch[] {
  const { config } = node.data
  const n = config.inputCount
  const matches: NewMatch[] = []
  let ordre = 1

  const provenanceBySlot = new Map(provenances.map((p) => [p.inputIndex, p.label]))
  const schedule = circleSchedule(n)

  for (let tour = 0; tour < schedule.length; tour++) {
    const round = schedule[tour]
    for (let m = 0; m < round.length; m++) {
      const [slot1, slot2] = round[m]
      matches.push({
        tournament_id: tournamentId,
        phase_node_id: node.id,
        nom: `Tour ${tour + 1} Match ${m + 1} de ${config.name}`,
        statut: 'a_jouer',
        equipe1_id: null,
        equipe2_id: null,
        equipe1_label: isRoot ? null : (provenanceBySlot.get(slot1) ?? null),
        equipe2_label: isRoot ? null : (provenanceBySlot.get(slot2) ?? null),
        horaire: null,
        piste: null,
        ordre,
        round: tour + 1,
        score_equipe1: null,
        score_equipe2: null,
      })
      ordre++
    }
  }

  return matches
}

// ---------------------------------------------------------------------------
// Élimination : bracket avec gestion des byes
// ---------------------------------------------------------------------------

function getRoundName(matchesInRound: number): string {
  if (matchesInRound === 1) return 'Finale'
  if (matchesInRound === 2) return 'Demi-finale'
  if (matchesInRound === 4) return 'Quart de finale'
  return `1/${matchesInRound * 2} de finale`
}

function generateEliminationMatches(
  node: SerializedNode,
  provenances: ProvenanceSlot[],
  isRoot: boolean,
  tournamentId: string,
): NewMatch[] {
  const { config } = node.data
  const n = config.inputCount
  const matches: NewMatch[] = []

  // Plus petite puissance de 2 >= n
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)))
  const numRounds = Math.ceil(Math.log2(n))
  const provenanceBySlot = new Map(provenances.map((p) => [p.inputIndex, p.label]))

  let ordre = 1

  // Stocker les noms des matchs par round pour construire les provenances internes
  // matchNames[round][matchIndexInRound] = nom du match
  const matchNames: string[][] = []

  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round)
    const roundName = getRoundName(matchesInRound)
    const roundMatchNames: string[] = []

    for (let m = 0; m < matchesInRound; m++) {
      const matchLabel =
        matchesInRound === 1
          ? `${roundName} de ${config.name}`
          : `${roundName} ${m + 1} de ${config.name}`

      roundMatchNames.push(matchLabel)

      if (round === 1) {
        // Premier round : les slots viennent des entrées de la phase
        const slot1 = m * 2 + 1
        const slot2 = m * 2 + 2

        // Gestion des byes : si le slot dépasse n, c'est un bye
        const isBye1 = slot1 > n
        const isBye2 = slot2 > n

        if (isBye1 && isBye2) {
          // Double bye — pas de match (ne devrait pas arriver normalement)
          continue
        }

        if (isBye1 || isBye2) {
          // Un bye — pas de match réel, le joueur avance directement
          // On ne crée pas ce match, le round suivant récupérera directement le label
          continue
        }

        matches.push({
          tournament_id: tournamentId,
          phase_node_id: node.id,
          nom: matchLabel,
          statut: 'a_jouer',
          equipe1_id: null,
          equipe2_id: null,
          equipe1_label: isRoot ? null : (provenanceBySlot.get(slot1) ?? null),
          equipe2_label: isRoot ? null : (provenanceBySlot.get(slot2) ?? null),
          horaire: null,
          piste: null,
          ordre,
          round,
          score_equipe1: null,
          score_equipe2: null,
        })
        ordre++
      } else {
        // Rounds suivants : provenances internes
        const prevRound = round - 1
        const child1Idx = m * 2
        const child2Idx = m * 2 + 1

        const label1 = getInternalProvenance(
          child1Idx,
          prevRound,
          matchNames,
          provenanceBySlot,
          isRoot,
          n,
          config.name,
        )
        const label2 = getInternalProvenance(
          child2Idx,
          prevRound,
          matchNames,
          provenanceBySlot,
          isRoot,
          n,
          config.name,
        )

        matches.push({
          tournament_id: tournamentId,
          phase_node_id: node.id,
          nom: matchLabel,
          statut: 'a_jouer',
          equipe1_id: null,
          equipe2_id: null,
          equipe1_label: label1,
          equipe2_label: label2,
          horaire: null,
          piste: null,
          ordre,
          round,
          score_equipe1: null,
          score_equipe2: null,
        })
        ordre++
      }
    }

    matchNames.push(roundMatchNames)
  }

  return matches
}

/**
 * Détermine le label d'un slot dans un round > 1.
 * Si le match enfant était un bye, on remonte directement au label d'entrée.
 * Sinon on utilise "Vainqueur {nom_match}".
 */
function getInternalProvenance(
  childMatchIdx: number,
  prevRound: number,
  matchNames: string[][],
  provenanceBySlot: Map<number, string>,
  isRoot: boolean,
  totalTeams: number,
  phaseName: string,
): string {
  // Vérifier si le match enfant était un bye (premier round uniquement)
  if (prevRound === 1) {
    const slot1 = childMatchIdx * 2 + 1
    const slot2 = childMatchIdx * 2 + 2
    const isBye1 = slot1 > totalTeams
    const isBye2 = slot2 > totalTeams

    if (isBye1 || isBye2) {
      // Un des deux est un bye, l'autre avance directement
      const advancingSlot = isBye1 ? slot2 : slot1
      if (!isRoot && provenanceBySlot.has(advancingSlot)) {
        return provenanceBySlot.get(advancingSlot)!
      }
      return `Équipe ${advancingSlot} de ${phaseName}`
    }
  }

  // Match normal — référencer le vainqueur
  const prevMatchName = matchNames[prevRound - 1]?.[childMatchIdx]
  if (prevMatchName) {
    return `Vainqueur ${prevMatchName}`
  }
  return `Vainqueur match ${childMatchIdx + 1}`
}

// ---------------------------------------------------------------------------
// Calcul des slots d'entrée par match (pour l'assignation d'équipes)
// ---------------------------------------------------------------------------

/**
 * Pour une phase racine, retourne les paires de slots d'entrée pour chaque match
 * dans l'ordre de génération (ordre). Seuls les matchs avec des slots directs
 * sont retournés (round robin: tous, élimination: round 1 uniquement).
 */
export function computeInputSlotPairs(
  phaseType: 'round_robin' | 'elimination',
  inputCount: number,
): { ordre: number; slot1: number; slot2: number }[] {
  const pairs: { ordre: number; slot1: number; slot2: number }[] = []

  if (phaseType === 'round_robin') {
    const schedule = circleSchedule(inputCount)
    let ordre = 1
    for (const round of schedule) {
      for (const [slot1, slot2] of round) {
        pairs.push({ ordre, slot1, slot2 })
        ordre++
      }
    }
  } else {
    // Élimination : seul le round 1 a des slots d'entrée directs
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(inputCount)))
    const matchesInRound1 = bracketSize / 2
    let ordre = 1
    for (let m = 0; m < matchesInRound1; m++) {
      const slot1 = m * 2 + 1
      const slot2 = m * 2 + 2
      if (slot1 > inputCount || slot2 > inputCount) continue // bye
      pairs.push({ ordre, slot1, slot2 })
      ordre++
    }
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

export function generateAllMatches(
  graph: TournamentGraph,
  tournamentId: string,
): NewMatch[] {
  const sortedNodes = topologicalSort(graph)
  const provenanceMap = buildProvenanceMap(graph)
  const allMatches: NewMatch[] = []

  for (const node of sortedNodes) {
    if (node.data.config.type === 'super_americana') continue

    const provenances = provenanceMap.get(node.id) ?? []
    const isRoot = !graph.edges.some((e) => e.target === node.id)

    const matches =
      node.data.config.type === 'round_robin'
        ? generateRoundRobinMatches(node, provenances, isRoot, tournamentId)
        : generateEliminationMatches(node, provenances, isRoot, tournamentId)

    allMatches.push(...matches)
  }

  return allMatches
}
