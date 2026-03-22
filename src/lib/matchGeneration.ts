import type { TournamentGraph, SerializedNode, Match } from '../types/tournament'

type NewMatch = Omit<Match, 'id' | 'created_at'>

interface ProvenanceSlot {
  inputIndex: number
  label: string
}

// ---------------------------------------------------------------------------
// Tri topologique (Kahn) — phases racine d'abord
// ---------------------------------------------------------------------------

function topologicalSort(graph: TournamentGraph): SerializedNode[] {
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
// Round Robin : N*(N-1)/2 matchs
// ---------------------------------------------------------------------------

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

  for (let i = 1; i <= n; i++) {
    for (let j = i + 1; j <= n; j++) {
      matches.push({
        tournament_id: tournamentId,
        phase_node_id: node.id,
        nom: `Match ${ordre} de ${config.name}`,
        statut: 'a_jouer',
        equipe1_id: null,
        equipe2_id: null,
        equipe1_label: isRoot ? null : (provenanceBySlot.get(i) ?? null),
        equipe2_label: isRoot ? null : (provenanceBySlot.get(j) ?? null),
        horaire: null,
        piste: null,
        ordre,
        round: null,
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
